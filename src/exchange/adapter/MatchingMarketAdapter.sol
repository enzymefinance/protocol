pragma solidity ^0.4.20;

import "../thirdparty/MatchingMarket.sol";
import "../../Fund.sol";
import "../../dependencies/DBC.sol";
import "ds-math/math.sol";


/// @title MatchingMarketAdapter Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Adapter between Melon and OasisDex Matching Market
contract MatchingMarketAdapter is DSMath, DBC {

    event OrderUpdated(address exchange, uint orderId);

    //  METHODS

    // Responsibilities of makeOrder are:
    // - check price recent
    // - check risk management passes
    // - approve funds to be traded (if necessary)
    // - make order on the exchange
    // - check order was made (if possible)
    // - place asset in ownedAssets if not already tracked
    /// @notice Makes an order on the selected exchange
    /// @dev get/give is from maker's perspective
    /// @dev These orders are not expected to settle immediately
    /// @param orderAddresses [2] Asset to be sold (giveAsset)
    /// @param orderAddresses [3] Asset to be bought (getAsset)
    /// @param orderValues [0] Quantity of giveAsset to be sold
    /// @param orderValues [1] Quantity of getAsset to be bought
    function makeOrder(
        address targetExchange,
        address[5] orderAddresses,
        uint[6] orderValues,
        bytes32 identifier,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) {
        require(Fund(this).owner() == msg.sender);
        require(!Fund(this).isShutDown());

        ERC20 giveAsset = ERC20(orderAddresses[2]);
        ERC20 getAsset = ERC20(orderAddresses[3]);
        uint giveQuantity = orderValues[0];
        uint getQuantity = orderValues[1];

        require(makeOrderPermitted(giveQuantity, giveAsset, getQuantity, getAsset));
        require(giveAsset.approve(targetExchange, giveQuantity));

        uint orderId = MatchingMarket(targetExchange).offer(giveQuantity, giveAsset, getQuantity, getAsset);

        require(orderId != 0);   // defines success in MatchingMarket
        require(
            Fund(this).isInAssetList(getAsset) ||
            Fund(this).getOwnedAssetsLength() < Fund(this).MAX_FUND_ASSETS()
        );

        Fund(this).addOpenMakeOrder(targetExchange, giveAsset, orderId);
        Fund(this).addAssetToOwnedAssets(getAsset);
        OrderUpdated(targetExchange, uint(orderId));
    }

    // Responsibilities of takeOrder are:
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
    /// @dev Get/give is from taker's perspective
    /// @param identifier Active order id
    /// @param orderValues [1] Buy quantity of what others are selling on selected Exchange
    function takeOrder(
        address targetExchange,
        address[5] orderAddresses,
        uint[6] orderValues,
        bytes32 identifier,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) {
        require(Fund(this).owner() == msg.sender);
        require(!Fund(this).isShutDown());
        var (pricefeed,,) = Fund(this).modules();
        uint getQuantity = orderValues[1];
        var (
            maxGetQuantity,
            getAsset,
            maxGiveQuantity,
            giveAsset
        ) = MatchingMarket(targetExchange).getOffer(uint(identifier));

        require(giveAsset != address(this) && getAsset != address(this));
        require(address(getAsset) != address(giveAsset));
        require(pricefeed.existsPriceOnAssetPair(giveAsset, getAsset));
        require(getQuantity <= maxGetQuantity);

        uint spendQuantity = mul(getQuantity, maxGiveQuantity) / maxGetQuantity;
        require(takeOrderPermitted(spendQuantity, giveAsset, getQuantity, getAsset));
        require(giveAsset.approve(targetExchange, spendQuantity));
        require(MatchingMarket(targetExchange).buy(uint(identifier), getQuantity));
        require(
            Fund(this).isInAssetList(getAsset) ||
            Fund(this).getOwnedAssetsLength() < Fund(this).MAX_FUND_ASSETS()
        );

        Fund(this).addAssetToOwnedAssets(getAsset);
        OrderUpdated(targetExchange, uint(identifier));
    }

    // responsibilities of cancelOrder are:
    // - check sender is this contract or owner, or that order expired
    // - remove order from tracking array
    // - cancel order on exchange
    /// @notice Cancels orders that were not expected to settle immediately
    /// @param targetExchange Address of the exchange
    /// @param orderAddresses [2] Asset for which we want to cancel an order
    /// @param identifier Order ID on the exchange
    function cancelOrder(
        address targetExchange,
        address[5] orderAddresses,
        uint[6] orderValues,
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
        Fund(this).removeOpenMakeOrder(targetExchange, orderAddresses[2]);
        MatchingMarket(targetExchange).cancel(
            uint(identifier)
        );
        emit OrderUpdated(targetExchange, uint(identifier));
    }

    // VIEW METHODS

    /// @dev needed to avoid stack too deep error
    function makeOrderPermitted(
        uint giveQuantity,
        ERC20 giveAsset,
        uint getQuantity,
        ERC20 getAsset
    )
        internal
        view
        returns (bool) 
    {
        require(getAsset != address(this) && giveAsset != address(this));
        var (pricefeed, , riskmgmt) = Fund(this).modules();
        require(pricefeed.existsPriceOnAssetPair(giveAsset, getAsset));
        var (isRecent, referencePrice, ) = pricefeed.getReferencePriceInfo(giveAsset, getAsset);
        require(isRecent);
        uint orderPrice = pricefeed.getOrderPriceInfo(
            giveAsset,
            getAsset,
            giveQuantity,
            getQuantity
        );
        return(
            riskmgmt.isMakePermitted(
                orderPrice,
                referencePrice,
                giveAsset,
                getAsset,
                giveQuantity,
                getQuantity
            )
        );
    }

    /// @dev needed to avoid stack too deep error
    function takeOrderPermitted(
        uint giveQuantity,
        ERC20 giveAsset,
        uint getQuantity,
        ERC20 getAsset
    )
        internal
        view
        returns (bool)
    {
        var (pricefeed, , riskmgmt) = Fund(this).modules();
        var (isRecent, referencePrice, ) = pricefeed.getReferencePriceInfo(giveAsset, getAsset);
        require(isRecent);
        uint orderPrice = pricefeed.getOrderPriceInfo(
            giveAsset,
            getAsset,
            giveQuantity,
            getQuantity
        );
        return(
            riskmgmt.isTakePermitted(
                orderPrice,
                referencePrice,
                giveAsset,
                getAsset,
                giveQuantity,
                getQuantity
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
