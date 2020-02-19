pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "../fund/hub/Hub.sol";
import "../fund/trading/Trading.sol";
import "../fund/vault/Vault.sol";
import "../fund/accounting/Accounting.sol";
import "../dependencies/DSMath.sol";
import "./interfaces/IOasisDex.sol";
import "./ExchangeAdapter.sol";

/// @title OasisDexAdapter Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Adapter between Melon and OasisDex Matching Market
contract OasisDexAdapter is DSMath, ExchangeAdapter {

    event OrderCreated(uint256 id);

    //  METHODS

    //  PUBLIC METHODS

    // Responsibilities of makeOrder are:
    // - check sender
    // - check fund not shut down
    // - check price recent
    // - check risk management passes
    // - approve funds to be traded (if necessary)
    // - make order on the exchange
    // - check order was made (if possible)
    // - place asset in ownedAssets if not already tracked
    /// @notice Makes an order on the selected exchange
    /// @dev These orders are not expected to settle immediately
    /// @param targetExchange Address of the exchange
    /// @param orderAddresses [2] Order maker asset
    /// @param orderAddresses [3] Order taker asset
    /// @param orderValues [0] Maker token quantity
    /// @param orderValues [1] Taker token quantity
    function makeOrder(
        address targetExchange,
        address[8] memory orderAddresses,
        uint[8] memory orderValues,
        bytes[4] memory orderData,
        bytes32 identifier,
        bytes memory signature
    ) public override onlyManager notShutDown {
        ensureCanMakeOrder(orderAddresses[2]);
        address makerAsset = orderAddresses[2];
        address takerAsset = orderAddresses[3];
        uint256 makerQuantity = orderValues[0];
        uint256 takerQuantity = orderValues[1];

        // Order parameter checks
        getTrading().updateAndGetQuantityBeingTraded(makerAsset);
        ensureNotInOpenMakeOrder(makerAsset);

        approveAsset(makerAsset, targetExchange, makerQuantity, "makerAsset");

        uint256 orderId = IOasisDex(targetExchange).offer(makerQuantity, makerAsset, takerQuantity, takerAsset);

        // defines success in MatchingMarket
        require(orderId != 0, "Order ID should not be zero");

        getAccounting().addAssetToOwnedAssets(takerAsset);
        getTrading().orderUpdateHook(
            targetExchange,
            bytes32(orderId),
            Trading.UpdateType.make,
            [payable(makerAsset), payable(takerAsset)],
            [makerQuantity, takerQuantity, uint256(0)]
        );
        getTrading().addOpenMakeOrder(
            targetExchange,
            makerAsset,
            takerAsset,
            address(0),
            orderId,
            orderValues[4]
        );
        emit OrderCreated(orderId);
    }

    // Responsibilities of takeOrder are:
    // - check sender
    // - check fund not shut down
    // - check not buying own fund tokens
    // - check price exists for asset pair
    // - check price is recent
    // - check price passes risk management
    // - approve funds to be traded (if necessary)
    // - take order from the exchange
    // - check order was taken (if possible)
    // - place asset in ownedAssets if not already tracked
    /// @notice Takes an active order on the selected exchange
    /// @dev These orders are expected to settle immediately
    /// @param targetExchange Address of the exchange
    /// @param orderValues [6] Fill amount : amount of taker token to fill
    /// @param identifier Active order id
    function takeOrder(
        address targetExchange,
        address[8] memory orderAddresses,
        uint[8] memory orderValues,
        bytes[4] memory orderData,
        bytes32 identifier,
        bytes memory signature
    ) public override onlyManager notShutDown {
        Hub hub = getHub();
        uint256 fillTakerQuantity = orderValues[6];
        uint256 maxMakerQuantity;
        address makerAsset;
        uint256 maxTakerQuantity;
        address takerAsset;
        (
            maxMakerQuantity,
            makerAsset,
            maxTakerQuantity,
            takerAsset
        ) = IOasisDex(targetExchange).getOffer(uint256(identifier));
        uint256 fillMakerQuantity = mul(fillTakerQuantity, maxMakerQuantity) / maxTakerQuantity;

        require(
            makerAsset == orderAddresses[2] && takerAsset == orderAddresses[3],
            "Maker and taker assets do not match the order addresses"
        );
        require(
            makerAsset != takerAsset,
            "Maker and taker assets cannot be the same"
        );
        require(fillMakerQuantity <= maxMakerQuantity, "Maker amount to fill above max");
        require(fillTakerQuantity <= maxTakerQuantity, "Taker amount to fill above max");

        approveAsset(takerAsset, targetExchange, fillTakerQuantity, "takerAsset");

        require(
            IOasisDex(targetExchange).buy(uint256(identifier), fillMakerQuantity),
            "Buy on matching market failed"
        );

        getAccounting().addAssetToOwnedAssets(makerAsset);
        getAccounting().updateOwnedAssets();
        uint256 timesMakerAssetUsedAsFee = getTrading().openMakeOrdersUsingAssetAsFee(makerAsset);
        if (
            !getTrading().isInOpenMakeOrder(makerAsset) &&
            timesMakerAssetUsedAsFee == 0
        ) {
            getTrading().returnAssetToVault(makerAsset);
        }
        getTrading().orderUpdateHook(
            targetExchange,
            bytes32(identifier),
            Trading.UpdateType.take,
            [payable(makerAsset), payable(takerAsset)],
            [maxMakerQuantity, maxTakerQuantity, fillTakerQuantity]
        );
    }

    // responsibilities of cancelOrder are:
    // - check sender is owner, or that order expired, or that fund shut down
    // - remove order from tracking array
    // - cancel order on exchange
    /// @notice Cancels orders that were not expected to settle immediately
    /// @param targetExchange Address of the exchange
    /// @param orderAddresses [2] Order maker asset
    /// @param identifier Order ID on the exchange
    function cancelOrder(
        address targetExchange,
        address[8] memory orderAddresses,
        uint[8] memory orderValues,
        bytes[4] memory orderData,
        bytes32 identifier,
        bytes memory signature
    ) public override {
        require(uint256(identifier) != 0, "ID cannot be zero");
        address makerAsset;
        (, makerAsset, ,) = IOasisDex(targetExchange).getOffer(uint256(identifier));
        ensureCancelPermitted(targetExchange, makerAsset, identifier);

        require(
            address(makerAsset) == orderAddresses[2],
            "Retrieved and passed assets do not match"
        );

        getTrading().removeOpenMakeOrder(targetExchange, makerAsset);
        IOasisDex(targetExchange).cancel(uint256(identifier));
        uint256 timesMakerAssetUsedAsFee = getTrading().openMakeOrdersUsingAssetAsFee(makerAsset);
        if (timesMakerAssetUsedAsFee == 0) {
            getTrading().returnAssetToVault(makerAsset);
        }
        getAccounting().updateOwnedAssets();
        getTrading().orderUpdateHook(
            targetExchange,
            bytes32(identifier),
            Trading.UpdateType.cancel,
            [address(0), address(0)],
            [uint256(0), uint256(0), uint256(0)]
        );
    }

    // VIEW METHODS

    function getOrder(address targetExchange, uint256 id, address makerAsset)
        public
        view
        override
        returns (address, address, uint256, uint256)
    {
        uint256 sellQuantity;
        address sellAsset;
        uint256 buyQuantity;
        address buyAsset;
        (
            sellQuantity,
            sellAsset,
            buyQuantity,
            buyAsset
        ) = IOasisDex(targetExchange).getOffer(id);
        return (
            sellAsset,
            buyAsset,
            sellQuantity,
            buyQuantity
        );
    }
}
