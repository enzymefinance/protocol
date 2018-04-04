pragma solidity ^0.4.20;

import "../thirdparty/0x/Exchange.sol";
import "../../Fund.sol";
import "../../dependencies/DBC.sol";
import "ds-math/math.sol";


/// @title ZeroExV1Adapter Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Adapter between Melon and 0x Exchange Contract (version 1)
contract ZeroExV1Adapter is DSMath, DBC {

    event OrderUpdated(address exchange, uint orderId);

    //  METHODS

    function makeOrder(
        address targetExchange,
        address[5] orderAddresses,
        uint[7] orderValues,
        bytes32 identifier,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) {
        revert();
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
    /// @notice Risk management
    /// @dev These orders are expected to settle immediately
    /// @dev Get/give is from taker's perspective
    /// @param identifier Active order id
    /// @param orderValues [6] Buy quantity of what others are selling on selected Exchange
    function takeOrder(
        address targetExchange,
        address[5] orderAddresses,
        uint[7] orderValues,
        bytes32 identifier,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) {
        require(Fund(this).owner() == msg.sender);
        require(!Fund(this).isShutDown());
        Token getAsset = Token(orderAddresses[2]);
        Token giveAsset = Token(orderAddresses[3]);
        uint maxGetQuantity = orderValues[0];
        uint maxGiveQuantity = orderValues[1];
        uint fillGiveQuantity = orderValues[6];
        uint fillGetQuantity = mul(fillGiveQuantity, maxGetQuantity) / maxGiveQuantity;

        require(takeOrderPermitted(fillGiveQuantity, giveAsset, fillGetQuantity, getAsset));
        require(giveAsset.approve(Exchange(targetExchange).TOKEN_TRANSFER_PROXY_CONTRACT(), fillGiveQuantity));
        uint filledAmount = executeFill(targetExchange, orderAddresses, orderValues, fillGiveQuantity, v, r, s);
        require(filledAmount == fillGiveQuantity);
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
        uint[7] orderValues,
        bytes32 identifier,
        uint8 v,
        bytes32 r,
        bytes32 s
    )
        // pre_cond(Fund(this).owner() == msg.sender ||
        //          Fund(this).isShutDown()          ||
        //          Fund(this).orderExpired(targetExchange, orderAddresses[2])
        // )
    {
        revert();
        // require(uint(identifier) != 0);
        // Fund(this).removeOpenMakeOrder(targetExchange, orderAddresses[2]);
        // MatchingMarket(targetExchange).cancel(
        //     uint(identifier)
        // );
        // emit OrderUpdated(targetExchange, uint(identifier));
    }

    /// @dev needed to avoid stack too deep error
    function executeFill(
        address targetExchange,
        address[5] orderAddresses,
        uint[7] orderValues,
        uint fillGiveQuantity,
        uint8 v,
        bytes32 r,
        bytes32 s
    )
        returns (uint)
    {
        return Exchange(targetExchange).fillOrder(
            orderAddresses,
            [
                orderValues[0], orderValues[1], orderValues[2], 
                orderValues[3], orderValues[4], orderValues[5]
            ],
            fillGiveQuantity,
            false,
            v,
            r,
            s
        );
     }

    // VIEW METHODS

    /// @dev needed to avoid stack too deep error
    function makeOrderPermitted(
        uint giveQuantity,
        Token giveAsset,
        uint getQuantity,
        Token getAsset
    )
        internal
        view
        returns (bool) 
    {
        revert();
    }

    /// @dev needed to avoid stack too deep error
    function takeOrderPermitted(
        uint giveQuantity,
        Token giveAsset,
        uint getQuantity,
        Token getAsset
    )
        internal
        view
        returns (bool)
    {
        require(giveAsset != address(this) && getAsset != address(this));
        require(address(getAsset) != address(giveAsset));
        // require(fillGiveQuantity <= maxGiveQuantity);
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
        revert();
    }

    // TODO: delete this function if possible
    function getOrder(address targetExchange, uint id)
        view
        returns (address, address, uint, uint)
    {
        revert();
    }
}

