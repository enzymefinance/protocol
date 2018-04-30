pragma solidity ^0.4.20;

import "./ExchangeAdapterInterface.sol";
import "../thirdparty/MatchingMarket.sol";
import "../../Fund.sol";
import "../../dependencies/DBC.sol";
import "ds-math/math.sol";


/// @title MatchingMarketAdapter Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Adapter between Melon and OasisDex Matching Market
contract MatchingMarketAdapter is ExchangeAdapterInterface, DSMath, DBC {

    //  METHODS

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
        require(Fund(this).owner() == msg.sender);
        require(!Fund(this).isShutDown());

        ERC20 makerAsset = ERC20(orderAddresses[2]);
        ERC20 takerAsset = ERC20(orderAddresses[3]);
        uint makerQuantity = orderValues[0];
        uint takerQuantity = orderValues[1];

        require(makeOrderPermitted(makerQuantity, makerAsset, takerQuantity, takerAsset));
        require(makerAsset.approve(targetExchange, makerQuantity));

        uint orderId = MatchingMarket(targetExchange).offer(makerQuantity, makerAsset, takerQuantity, takerAsset);

        require(orderId != 0);   // defines success in MatchingMarket
        require(
            Fund(this).isInAssetList(takerAsset) ||
            Fund(this).getOwnedAssetsLength() < Fund(this).MAX_FUND_ASSETS()
        );

        Fund(this).addOpenMakeOrder(targetExchange, makerAsset, orderId);
        Fund(this).addAssetToOwnedAssets(takerAsset);
        Fund(this).orderUpdateHook(
            targetExchange,
            bytes32(identifier),
            Fund.UpdateType.make,
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
        require(Fund(this).owner() == msg.sender);
        require(!Fund(this).isShutDown());
        var (pricefeed,,) = Fund(this).modules();
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
        require(pricefeed.existsPriceOnAssetPair(takerAsset, makerAsset));
        require(fillMakerQuantity <= maxMakerQuantity);
        require(fillTakerQuantity <= maxTakerQuantity);
        require(takeOrderPermitted(fillTakerQuantity, takerAsset, fillMakerQuantity, makerAsset));
        require(takerAsset.approve(targetExchange, fillTakerQuantity));
        require(MatchingMarket(targetExchange).buy(uint(identifier), fillMakerQuantity));
        require(
            Fund(this).isInAssetList(makerAsset) ||
            Fund(this).getOwnedAssetsLength() < Fund(this).MAX_FUND_ASSETS()
        );

        Fund(this).addAssetToOwnedAssets(makerAsset);
        Fund(this).orderUpdateHook(
            targetExchange,
            bytes32(identifier),
            Fund.UpdateType.take,
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
        pre_cond(Fund(this).owner() == msg.sender ||
                 Fund(this).isShutDown()          ||
                 Fund(this).orderExpired(targetExchange, orderAddresses[2])
        )
    {
        require(uint(identifier) != 0);

        var (, makerAsset, ,) = MatchingMarket(targetExchange).getOffer(uint(identifier));

        require(address(makerAsset) == orderAddresses[2]); // ensure we are checking correct asset

        Fund(this).removeOpenMakeOrder(targetExchange, orderAddresses[2]);
        MatchingMarket(targetExchange).cancel(
            uint(identifier)
        );
        Fund(this).orderUpdateHook(
            targetExchange,
            bytes32(identifier),
            Fund.UpdateType.cancel,
            [address(0x0), address(0x0)],
            [uint(0), uint(0), uint(0)]
        );
    }

    // VIEW METHODS

    /// @dev needed to avoid stack too deep error
    function makeOrderPermitted(
        uint makerQuantity,
        ERC20 makerAsset,
        uint takerQuantity,
        ERC20 takerAsset
    )
        internal
        view
        returns (bool) 
    {
        require(takerAsset != address(this) && makerAsset != address(this));
        var (pricefeed, , riskmgmt) = Fund(this).modules();
        require(pricefeed.existsPriceOnAssetPair(makerAsset, takerAsset));
        var (isRecent, referencePrice, ) = pricefeed.getReferencePriceInfo(makerAsset, takerAsset);
        require(isRecent);
        uint orderPrice = pricefeed.getOrderPriceInfo(
            makerAsset,
            takerAsset,
            makerQuantity,
            takerQuantity
        );
        return(
            riskmgmt.isMakePermitted(
                orderPrice,
                referencePrice,
                makerAsset,
                takerAsset,
                makerQuantity,
                takerQuantity
            )
        );
    }

    /// @dev needed to avoid stack too deep error
    function takeOrderPermitted(
        uint takerQuantity,
        ERC20 takerAsset,
        uint makerQuantity,
        ERC20 makerAsset
    )
        internal
        view
        returns (bool)
    {
        var (pricefeed, , riskmgmt) = Fund(this).modules();
        var (isRecent, referencePrice, ) = pricefeed.getReferencePriceInfo(takerAsset, makerAsset);
        require(isRecent);
        uint orderPrice = pricefeed.getOrderPriceInfo(
            takerAsset,
            makerAsset,
            takerQuantity,
            makerQuantity
        );
        return(
            riskmgmt.isTakePermitted(
                orderPrice,
                referencePrice,
                takerAsset,
                makerAsset,
                takerQuantity,
                makerQuantity
            )
        );
    }

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
