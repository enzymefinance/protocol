pragma solidity ^0.4.21;


import "./MatchingMarket.sol";
import "../fund/hub/Hub.sol";
import "../fund/trading/Trading.sol";
import "../fund/vault/Vault.sol";
import "../fund/accounting/Accounting.sol";
import "../dependencies/math.sol";

// TODO: re-enable all checks when routing sorted, and adding assets to lists
/// @title MatchingMarketAdapter Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Adapter between Melon and OasisDex Matching Market
contract MatchingMarketAdapter is DSMath {

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
        address[5] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) {
        Hub hub = Hub(Trading(address(this)).hub());
        require(hub.manager() == msg.sender);
        require(!hub.isShutDown());

        ERC20 makerAsset = ERC20(orderAddresses[2]);
        ERC20 takerAsset = ERC20(orderAddresses[3]);
        uint makerQuantity = orderValues[0];
        uint takerQuantity = orderValues[1];

        Vault vault = Vault(hub.vault());
        vault.withdraw(makerAsset, makerQuantity);
        require(makerAsset.approve(targetExchange, makerQuantity));

        uint orderId = MatchingMarket(targetExchange).offer(makerQuantity, makerAsset, takerQuantity, takerAsset);

        require(orderId != 0);   // defines success in MatchingMarket
        // require(
        //     Accounting(hub.accounting()).isInAssetList(takerAsset)
        //     Fund(address(this)).getOwnedAssetsLength() < Fund(address(this)).MAX_FUND_ASSETS()
        // );

        Trading(address(this)).addOpenMakeOrder(targetExchange, makerAsset, orderId);
        Accounting(hub.accounting()).addAssetToOwnedAssets(takerAsset);
        Trading(address(this)).orderUpdateHook(
            targetExchange,
            bytes32(orderId),
            Trading.UpdateType.make,
            [address(makerAsset), address(takerAsset)],
            [makerQuantity, takerQuantity, uint(0)]
        );
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
        address[5] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) {
        // require(Fund(address(this)).manager() == msg.sender);
        require(!Hub(Trading(address(this)).hub()).isShutDown());
        address pricefeed = Hub(Trading(address(this)).hub()).priceSource();
        uint fillTakerQuantity = orderValues[6];
        var (
            maxMakerQuantity,
            makerAsset,
            maxTakerQuantity,
            takerAsset
        ) = MatchingMarket(targetExchange).getOffer(uint(identifier));
        uint fillMakerQuantity = mul(fillTakerQuantity, maxMakerQuantity) / maxTakerQuantity;

        require(takerAsset != address(this) && makerAsset != address(this));
        require(address(makerAsset) != address(takerAsset));
        // require(pricefeed.existsPriceOnAssetPair(takerAsset, makerAsset));
        require(fillMakerQuantity <= maxMakerQuantity);
        require(fillTakerQuantity <= maxTakerQuantity);

        require(takerAsset.approve(targetExchange, fillTakerQuantity));
        require(MatchingMarket(targetExchange).buy(uint(identifier), fillMakerQuantity));
        // require(
        //     Trading(address(this)).isInAssetList(makerAsset) ||
        //     Trading(address(this)).getOwnedAssetsLength() < Trading(address(this)).MAX_FUND_ASSETS()
        // );

        // Accounting(address(this)).addAssetToOwnedAssets(makerAsset);
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
        address[5] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        uint8 v,
        bytes32 r,
        bytes32 s
    )
    {
        Hub hub = Hub(Trading(address(this)).hub());
        require(hub.manager() == msg.sender ||    // TODO: check that this makes sense (manager)
                hub.isShutDown()          //||
                // hub.orderExpired(targetExchange, orderAddresses[2])
        );
        require(uint(identifier) != 0);

        var (, makerAsset, ,) = MatchingMarket(targetExchange).getOffer(uint(identifier));

        require(address(makerAsset) == orderAddresses[2]); // ensure we are checking correct asset

        Trading(address(this)).removeOpenMakeOrder(targetExchange, orderAddresses[2]);
        MatchingMarket(targetExchange).cancel(
            uint(identifier)
        );
        Trading(address(this)).orderUpdateHook(
            targetExchange,
            bytes32(identifier),
            Trading.UpdateType.cancel,
            [address(0), address(0)],
            [uint(0), uint(0), uint(0)]
        );
    }

    // VIEW METHODS

    // TODO: delete this function if possible
    function getLastOrderId(address targetExchange)
        view
        returns (uint)
    {
        return MatchingMarket(targetExchange).last_offer_id();
    }

    // TODO: delete this function if possible
    function getOrder(address targetExchange, uint id)
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
