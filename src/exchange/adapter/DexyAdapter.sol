pragma solidity ^0.4.21;

import "./ExchangeAdapterInterface.sol";
import "../thirdparty/dexy/Exchange.sol";
import "../thirdparty/dexy/Vault.sol";
import "../../Fund.sol";
import "../../dependencies/DBC.sol";
import "ds-math/math.sol";


/// @title Dexy Adapter Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Adapter between Melon and Dexy Exchange
contract DexyAdapter is ExchangeAdapterInterface, DSMath, DBC {

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
    /// @param orderValues [4] Order expiration time
    /// @param orderValues [5] Order nonce
    function makeOrder(
        address targetExchange,
        address[5] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) {
        // TODO: account for orders made/taken with ETH (?)
        require(Fund(this).owner() == msg.sender);
        require(!Fund(this).isShutDown());

        ERC20 giveAsset = ERC20(orderAddresses[2]);
        ERC20 getAsset = ERC20(orderAddresses[3]);
        uint giveQuantity = orderValues[0];
        uint getQuantity = orderValues[1];

        // require(makeOrderPermitted(giveQuantity, giveAsset, getQuantity, getAsset));
        VaultInterface vault = Exchange(targetExchange).vault();

        if (!vault.isApproved(address(this), targetExchange)) {
            vault.approve(targetExchange);
        }
        giveAsset.approve(address(vault), giveQuantity);
        vault.deposit(address(giveAsset), giveQuantity);

        Exchange(targetExchange).order(
            [address(giveAsset), address(getAsset)],
            [giveQuantity, getQuantity, orderValues[4], orderValues[5]]
        );

        // require(orderId != 0);   // defines success in MatchingMarket
        require(
            Fund(this).isInAssetList(getAsset) ||
            Fund(this).getOwnedAssetsLength() < Fund(this).MAX_FUND_ASSETS()
        );

        // Fund(this).addOpenMakeOrder(targetExchange, giveAsset, orderId);
        Fund(this).addAssetToOwnedAssets(getAsset);
        // TODO: get orderId from hash (may be emitting this event another way [see #433])
        // OrderUpdated(targetExchange, bytes32(orderId), UpdateTypes.Make);
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
    /// @param orderAddresses [0] Order maker
    /// @param orderAddresses [2] giveAsset (asset that is being sold by maker)
    /// @param orderAddresses [3] getAsset (asset that is being purchased)
    /// @param orderValues [1] Buy quantity of what others are selling on selected Exchange
    /// @param orderValues [6] Maximum amount of order to fill (in giveToken)
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

        ERC20 giveAsset = ERC20(orderAddresses[2]);
        ERC20 getAsset = ERC20(orderAddresses[3]);
        uint giveQuantity = orderValues[0];
        uint getQuantity = orderValues[1];

        require(giveAsset != address(this) && getAsset != address(this));
        require(address(getAsset) != address(giveAsset));

        bytes memory signature = concatenateSignature(uint8(orderValues[7]), v, r, s);

        require(takeOrderPermitted(giveQuantity, giveAsset, getQuantity, getAsset));

        VaultInterface vault = Exchange(targetExchange).vault();
        if (!vault.isApproved(address(this), targetExchange)) {
            vault.approve(targetExchange);
        }
        getAsset.approve(address(vault), getQuantity); // TODO: may need to change sematics of get/give asset here
        vault.deposit(address(getAsset), getQuantity);
        Exchange(targetExchange).trade(
            [orderAddresses[0], giveAsset, getAsset],
            [giveQuantity, getQuantity, orderValues[4], orderValues[5]],
            signature, orderValues[6]
        );
        vault.withdraw(address(giveAsset), giveQuantity);

        require(
            Fund(this).isInAssetList(getAsset) ||
            Fund(this).getOwnedAssetsLength() < Fund(this).MAX_FUND_ASSETS()
        );

        Fund(this).addAssetToOwnedAssets(getAsset);
        OrderUpdated(targetExchange, bytes32(identifier), UpdateTypes.Take);
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
        // require(uint(identifier) != 0);
        // Fund(this).removeOpenMakeOrder(targetExchange, orderAddresses[2]);
        // MatchingMarket(targetExchange).cancel(
        //     uint(identifier)
        // );
        // emit OrderUpdated(targetExchange, bytes32(identifier), UpdateTypes.Cancel);
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
        // require(getAsset != address(this) && giveAsset != address(this));
        // var (pricefeed, , riskmgmt) = Fund(this).modules();
        // require(pricefeed.existsPriceOnAssetPair(giveAsset, getAsset));
        // var (isRecent, referencePrice, ) = pricefeed.getReferencePriceInfo(giveAsset, getAsset);
        // require(isRecent);
        // uint orderPrice = pricefeed.getOrderPriceInfo(
        //     giveAsset,
        //     getAsset,
        //     giveQuantity,
        //     getQuantity
        // );
        // return(
        //     riskmgmt.isMakePermitted(
        //         orderPrice,
        //         referencePrice,
        //         giveAsset,
        //         getAsset,
        //         giveQuantity,
        //         getQuantity
        //     )
        // );
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
        require(pricefeed.existsPriceOnAssetPair(giveAsset, getAsset));
        var (isRecent, referencePrice, ) = pricefeed.getReferencePriceInfo(giveAsset, getAsset);
        require(isRecent);
        uint orderPrice = pricefeed.getOrderPriceInfo(
            giveAsset,
            getAsset,
            giveQuantity,
            getQuantity
        );
        return true;
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

    function concatenateSignature(
        uint mode,
        uint8 v,
        bytes32 r,
        bytes32 s
    )
        internal
        // pure
        returns (bytes)
    {
        bytes memory modeBytes = uint8ToBytes(uint8(mode));
        bytes memory vBytes = uint8ToBytes(v);
        bytes memory sig = new bytes(66);
        uint k = 0;
        for (uint i = 0; i < modeBytes.length; i++) sig[k++] = modeBytes[i];
        for (i = 0; i< vBytes.length; i++) sig[k++] = vBytes[i];
        for (i = 0; i< r.length; i++) sig[k++] = r[i];
        for (i = 0; i< s.length; i++) sig[k++] = s[i];
        return sig;
    }

    function uint8ToBytes(uint8 input) internal pure returns (bytes) {
        bytes memory b = new bytes(1);
        byte temp = byte(input);
        b[0] = temp;
        return b;
    }

    // // TODO: delete this function if possible
    // function getLastOrderId(address targetExchange)
    //     view
    //     returns (uint)
    // {
    //     return MatchingMarket(targetExchange).last_offer_id();
    // }

    // // TODO: delete this function if possible
    // function getOrder(address targetExchange, uint id)
    //     view
    //     returns (address, address, uint, uint)
    // {
    //     var (
    //         sellQuantity,
    //         sellAsset,
    //         buyQuantity,
    //         buyAsset
    //     ) = MatchingMarket(targetExchange).getOffer(id);
    //     return (
    //         address(sellAsset),
    //         address(buyAsset),
    //         sellQuantity,
    //         buyQuantity
    //     );
    // }
}

