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
    /// @param orderValues [4] Timestamp (order expiration)
    /// @param orderValues [5] Nonce
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

        ERC20 makerAsset = ERC20(orderAddresses[2]);
        ERC20 takerAsset = ERC20(orderAddresses[3]);
        uint makerQuantity = orderValues[0];
        uint takerQuantity = orderValues[1];

        // require(makeOrderPermitted(makerQuantity, makerAsset, takerQuantity, takerAsset));
        VaultInterface vault = Exchange(targetExchange).vault();

        if (!vault.isApproved(address(this), targetExchange)) {
            vault.approve(targetExchange);
        }
        makerAsset.approve(address(vault), makerQuantity);
        vault.deposit(address(makerAsset), makerQuantity);

        Exchange(targetExchange).order(
            [address(makerAsset), address(takerAsset)],
            [makerQuantity, takerQuantity, orderValues[4], orderValues[5]]
        );

        // require(orderId != 0);   // defines success in MatchingMarket
        require(
            Fund(this).isInAssetList(takerAsset) ||
            Fund(this).getOwnedAssetsLength() < Fund(this).MAX_FUND_ASSETS()
        );

        // Fund(this).addOpenMakeOrder(targetExchange, makerAsset, orderId);
        Fund(this).addAssetToOwnedAssets(takerAsset);
        // TODO: get orderId from hash (may be emitting this event another way [see #433])
        // OrderUpdated(targetExchange, bytes32(orderId), UpdateTypes.Make);
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
    /// @param orderAddresses [0] Order maker
    /// @param orderAddresses [2] Order maker asset
    /// @param orderAddresses [3] Order taker asset
    /// @param orderValues [0] Maker token quantity
    /// @param orderValues [1] Taker token quantity
    /// @param orderValues [4] Timestamp (order expiration)
    /// @param orderValues [5] Nonce
    /// @param orderValues [6] Fill amount: amount of taker token to be traded
    /// @param orderValues [7] Dexy signature mode
    /// @param identifier Active order id
    /// @param v ECDSA recovery id
    /// @param r ECDSA signature output r
    /// @param s ECDSA signature output s
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

        ERC20 takerAsset = ERC20(orderAddresses[2]);
        ERC20 makerAsset = ERC20(orderAddresses[3]);
        uint takerQuantity = orderValues[0];
        uint makerQuantity = orderValues[1];

        require(takerAsset != address(this) && makerAsset != address(this));
        require(address(makerAsset) != address(takerAsset));

        bytes memory signature = concatenateSignature(uint8(orderValues[7]), v, r, s);

        require(takeOrderPermitted(takerQuantity, takerAsset, makerQuantity, makerAsset));

        VaultInterface vault = Exchange(targetExchange).vault();
        if (!vault.isApproved(address(this), targetExchange)) {
            vault.approve(targetExchange);
        }
        makerAsset.approve(address(vault), makerQuantity);
        vault.deposit(address(makerAsset), makerQuantity);
        Exchange(targetExchange).trade(
            [orderAddresses[0], takerAsset, makerAsset],
            [takerQuantity, makerQuantity, orderValues[4], orderValues[5]],
            signature, orderValues[6]
        );
        vault.withdraw(address(takerAsset), takerQuantity);

        require(
            Fund(this).isInAssetList(makerAsset) ||
            Fund(this).getOwnedAssetsLength() < Fund(this).MAX_FUND_ASSETS()
        );

        Fund(this).addAssetToOwnedAssets(makerAsset);
        OrderUpdated(targetExchange, bytes32(identifier), UpdateTypes.Take);
    }

    // responsibilities of cancelOrder are:
    // - check sender is this contract or owner, or that order expired, or that fund shut down
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
        uint makerQuantity,
        ERC20 makerAsset,
        uint takerQuantity,
        ERC20 takerAsset
    )
        internal
        view
        returns (bool) 
    {
        // require(takerAsset != address(this) && makerAsset != address(this));
        // var (pricefeed, , riskmgmt) = Fund(this).modules();
        // require(pricefeed.existsPriceOnAssetPair(makerAsset, takerAsset));
        // var (isRecent, referencePrice, ) = pricefeed.getReferencePriceInfo(makerAsset, takerAsset);
        // require(isRecent);
        // uint orderPrice = pricefeed.getOrderPriceInfo(
        //     makerAsset,
        //     takerAsset,
        //     makerQuantity,
        //     takerQuantity
        // );
        // return(
        //     riskmgmt.isMakePermitted(
        //         orderPrice,
        //         referencePrice,
        //         makerAsset,
        //         takerAsset,
        //         makerQuantity,
        //         takerQuantity
        //     )
        // );
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
        require(pricefeed.existsPriceOnAssetPair(takerAsset, makerAsset));
        var (isRecent, referencePrice, ) = pricefeed.getReferencePriceInfo(takerAsset, makerAsset);
        require(isRecent);
        uint orderPrice = pricefeed.getOrderPriceInfo(
            takerAsset,
            makerAsset,
            takerQuantity,
            makerQuantity
        );
        return true;
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

