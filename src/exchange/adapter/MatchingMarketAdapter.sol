pragma solidity ^0.4.20;

import "../thirdparty/MatchingMarket.sol";
import "../../Fund.sol";
import "../../dependencies/DBC.sol";
import "ds-math/math.sol";


/// @title MatchingMarketAdapter Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Adapter between Melon and OasisDex Matching Market
contract MatchingMarketAdapter is DSMath, DBC {
    //  METHODS

    // Responsibilities of makeOrder are as follows:
    // - check price recent
    // - check risk management passes
    // - approve funds to be traded (if necessary)
    // - make order on the exchange
    // - check order was made (if possible)
    // - place asset in ownedAssets if not already tracked
    // TODO: add order tracking for open orders (?)
    /// @dev get/give is from maker's perspective
    function makeOrder(
        address targetExchange,
        address[5] orderAddresses,
        uint[6] orderValues,
        bytes32 identifier,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) {
        require(!Fund(this).isShutDown());
        require(Fund(this).owner() == msg.sender);
        ERC20 giveAsset = ERC20(orderAddresses[2]);
        ERC20 getAsset = ERC20(orderAddresses[3]);
        uint giveQuantity = orderValues[0];
        uint getQuantity = orderValues[1];
        require(makeOrderPermitted(giveQuantity, giveAsset, getQuantity, getAsset));
        require(giveAsset.approve(targetExchange, giveQuantity));
        uint id = MatchingMarket(targetExchange).offer(giveQuantity, giveAsset, getQuantity, getAsset);
        require(id != 0);   // defines success in MatchingMarket
        require(
            Fund(this).isInAssetList(getAsset) ||
            Fund(this).getOwnedAssetsLength() < Fund(this).MAX_FUND_ASSETS()
        );
        Fund(this).addAssetToOwnedAssets(getAsset);
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
    // TODO: add concept of expiration back to orders(?)
    /// @dev get/give is from taker's perspective
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
        if(address(getAsset) == address(giveAsset)) throw;

        require(giveAsset != address(this) && getAsset != address(this));
        require(pricefeed.existsPriceOnAssetPair(giveAsset, getAsset)); // TODO: throws?
        //// require(Fund(this).isInAssetList(sellAsset) || ownedAssets.length < MAX_FUND_ASSETS); // Limit for max ownable assets by the fund reached
        // require(getQuantity <= maxGetQuantity);
        uint spendQuantity = mul(getQuantity, maxGiveQuantity) / maxGetQuantity;
        require(giveAsset.approve(targetExchange, spendQuantity));
        require(takeOrderPermitted(spendQuantity, giveAsset, getQuantity, getAsset));
        require(MatchingMarket(targetExchange).buy(uint(identifier), getQuantity));
        // require(
        //     Fund(this).isInAssetList(getAsset) ||
        //     Fund(this).getOwnedAssetsLength() < Fund(this).MAX_FUND_ASSETS()
        // );
        // Fund(this).addAssetToOwnedAssets(getAsset);
    }

    function cancelOrder(
        address targetExchange,
        address[5] orderAddresses,
        uint[6] orderValues,
        bytes32 identifier,
        uint8 v,
        bytes32 r,
        bytes32 s
    )
        pre_cond(Fund(this).owner() == msg.sender || Fund(this).isShutDown()) // TODO: add back expiring order(?)
    {
        MatchingMarket(targetExchange).cancel(
            uint(identifier)
        );
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
