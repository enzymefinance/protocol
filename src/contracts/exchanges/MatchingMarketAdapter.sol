pragma solidity ^0.4.21;

import "Hub.sol";
import "Trading.sol";
import "Vault.sol";
import "Accounting.sol";
import "math.sol";
import "MatchingMarket.sol";
import "ExchangeAdapterInterface.sol";

/// @title MatchingMarketAdapter Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Adapter between Melon and OasisDex Matching Market
contract MatchingMarketAdapter is DSMath, ExchangeAdapterInterface {

    event OrderCreated(uint id);

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
        address[6] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        bytes makerAssetData,
        bytes takerAssetData,
        bytes signature
    ) {
        Hub hub = Hub(Trading(address(this)).hub());
        require(hub.manager() == msg.sender, "Manager is not sender");
        require(!hub.isShutDown(), "Hub is shut down");

        ERC20 makerAsset = ERC20(orderAddresses[2]);
        ERC20 takerAsset = ERC20(orderAddresses[3]);
        uint makerQuantity = orderValues[0];
        uint takerQuantity = orderValues[1];

        Vault(hub.vault()).withdraw(makerAsset, makerQuantity);
        require(
            makerAsset.approve(targetExchange, makerQuantity),
            "Could not approve maker asset"
        );

        uint orderId = MatchingMarket(targetExchange).offer(makerQuantity, makerAsset, takerQuantity, takerAsset);

        // defines success in MatchingMarket
        require(orderId != 0, "Order ID should not be zero");

        require(
            Accounting(hub.accounting()).isInAssetList(takerAsset) ||
            Accounting(hub.accounting()).getOwnedAssetsLength() < Accounting(hub.accounting()).MAX_OWNED_ASSETS(),
            "Max owned asset limit reached"
        );
        Accounting(hub.accounting()).addAssetToOwnedAssets(takerAsset);
        Trading(address(this)).orderUpdateHook(
            targetExchange,
            bytes32(orderId),
            Trading.UpdateType.make,
            [address(makerAsset), address(takerAsset)],
            [makerQuantity, takerQuantity, uint(0)]
        );
        Trading(address(this)).addOpenMakeOrder(targetExchange, makerAsset, orderId, orderValues[4]);
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
        address[6] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        bytes makerAssetData,
        bytes takerAssetData,
        bytes signature
    ) {
        Hub hub = Hub(Trading(address(this)).hub());
        require(hub.manager() == msg.sender, "Manager is not sender");
        require(!hub.isShutDown(), "Hub is shut down");

        uint fillTakerQuantity = orderValues[6];
        var (
            maxMakerQuantity,
            makerAsset,
            maxTakerQuantity,
            takerAsset
        ) = MatchingMarket(targetExchange).getOffer(uint(identifier));
        uint fillMakerQuantity = mul(fillTakerQuantity, maxMakerQuantity) / maxTakerQuantity;

        require(
            address(makerAsset) != address(takerAsset),
            "Maker and taker assets cannot be the same"
        );
        require(fillMakerQuantity <= maxMakerQuantity, "Maker amount to fill above max");
        require(fillTakerQuantity <= maxTakerQuantity, "Taker amount to fill above max");

        Vault(hub.vault()).withdraw(takerAsset, fillTakerQuantity);
        require(
            takerAsset.approve(targetExchange, fillTakerQuantity),
            "Taker asset could not be approved"
        );
        require(
            MatchingMarket(targetExchange).buy(uint(identifier), fillMakerQuantity),
            "Buy on matching market failed"
        );
        require(
            Accounting(hub.accounting()).isInAssetList(makerAsset) ||
            Accounting(hub.accounting()).getOwnedAssetsLength() < Accounting(hub.accounting()).MAX_OWNED_ASSETS(),
            "Max owned asset limit reached"
        );
        Accounting(hub.accounting()).addAssetToOwnedAssets(makerAsset);
        Trading(address(this)).returnAssetToVault(makerAsset);
        Trading(address(this)).orderUpdateHook(
            targetExchange,
            bytes32(identifier),
            Trading.UpdateType.take,
            [address(makerAsset), address(takerAsset)],
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
        address[6] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        bytes makerAssetData,
        bytes takerAssetData,
        bytes signature
    ) {
        Hub hub = Hub(Trading(address(this)).hub());
        var (, orderExpirationTime, ) = Trading(address(this)).getOpenOrderInfo(targetExchange, orderAddresses[2]);

        require(hub.manager() == msg.sender || hub.isShutDown() || block.timestamp > orderExpirationTime,
            "Manager must be sender or fund must be shut down or order must be expired"
        );
        require(uint(identifier) != 0, "ID cannot be zero");

        var (, makerAsset, ,) = MatchingMarket(targetExchange).getOffer(uint(identifier));

        require(
            address(makerAsset) == orderAddresses[2],
            "Retrieved and passed assets do not match"
        );

        Trading(address(this)).removeOpenMakeOrder(targetExchange, makerAsset);
        MatchingMarket(targetExchange).cancel(
            uint(identifier)
        );
        Trading(address(this)).returnAssetToVault(makerAsset);
        Trading(address(this)).orderUpdateHook(
            targetExchange,
            bytes32(identifier),
            Trading.UpdateType.cancel,
            [address(0), address(0)],
            [uint(0), uint(0), uint(0)]
        );
    }

    // VIEW METHODS

    function getOrder(address targetExchange, uint id, address makerAsset)
        view
        returns (address, address, uint, uint)
    {
        var (
            sellQuantity,
            sellAsset,
            buyQuantity,
            buyAsset
        ) = MatchingMarket(targetExchange).getOffer(id);
        return (
            address(sellAsset),
            address(buyAsset),
            sellQuantity,
            buyQuantity
        );
    }
}
