pragma solidity ^0.4.20;

import "../thirdparty/MatchingMarket.sol";
import "../../Fund.sol";
import "ds-math/math.sol";


/// @title MatchingMarketAdapter Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Adapter between Melon and OasisDex Matching Market
contract MatchingMarketAdapter is DSMath {

    MatchingMarket targetExchange;

    function MatchingMarketAdapter(address ofExchange) {
        targetExchange = MatchingMarket(ofExchange);
    }

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
        address[5] orderAddresses,
        uint[6] orderValues,
        bytes32 identifier,
        uint8 v,
        bytes32 r,
        bytes32 s
    )
        pre_cond(isOwner())
        pre_cond(!isShutDown)
    {
        ERC20 giveAsset = ERC20(orderAddresses[2]);
        ERC20 getAsset = ERC20(orderAddresses[2]);
        uint giveQuantity = orderValues[0];
        uint getQuantity = orderValues[1];
        makeOrderPermitted(giveQuantity, giveAsset, getQuantity, getAsset);
        require(ERC20(giveAsset).approve(targetExchange, giveQuantity));
        uint id = targetExchange.offer(giveQuantity, giveAsset, getQuantity, getAsset);
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
        address[5] orderAddresses,
        uint[6] orderValues,
        bytes32 identifier,
        uint8 v,
        bytes32 r,
        bytes32 s
    )
        pre_cond(isOwner())
        pre_cond(!isShutDown())
    {
        var (pricefeed,,) = Fund(this).modules();
        uint getQuantity = orderValues[1];

        var (
            maxGetQuantity,
            getAsset,
            maxGiveQuantity,
            giveAsset
        ) = targetExchange.getOffer(uint(identifier));

        require(giveAsset != address(this) && getAsset != address(this));
        require(pricefeed.existsPriceOnAssetPair(giveAsset, getAsset));
        // require(Fund(this).isInAssetList(sellAsset) || ownedAssets.length < MAX_FUND_ASSETS); // Limit for max ownable assets by the fund reached
        var (isRecent, referencePrice, ) = pricefeed.getReferencePriceInfo(giveAsset, getAsset);
        require(isRecent);
        require(getQuantity <= maxGetQuantity);
        uint spendQuantity = mul(getQuantity, maxGiveQuantity) / maxGetQuantity;
        require(ERC20(giveAsset).approve(targetExchange, spendQuantity));
        takeOrderPermitted(spendQuantity, giveAsset, getQuantity, getAsset);
        require(targetExchange.buy(uint(identifier), getQuantity));
        require(
            Fund(this).isInAssetList(getAsset) ||
            Fund(this).getOwnedAssetsLength() < Fund(this).MAX_FUND_ASSETS()
        );
        Fund(this).addAssetToOwnedAssets(getAsset);
    }

    function cancelOrder(
        address[5] orderAddresses,
        uint[6] orderValues,
        bytes32 identifier,
        uint8 v,
        bytes32 r,
        bytes32 s
    )
        pre_cond(isOwner() || isShutDown) // TODO: add back expiring order(?)
    }
        targetExchange.cancel(
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
        require(
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
    function getLastOrderId()
        view
        returns (uint)
    {
        return targetExchange.last_offer_id();
    }

    // TODO: delete this function if possible
    function getOrder(uint id)
        view
        returns (address, address, uint, uint)
    {
        var (
            sellQuantity,
            sellAsset,
            buyQuantity,
            buyAsset
        ) = targetExchange.getOffer(id);
        return (
            address(sellAsset),
            address(buyAsset),
            sellQuantity,
            buyQuantity
        );
    }
}
