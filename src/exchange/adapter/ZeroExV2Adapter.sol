pragma solidity ^0.4.21;
pragma experimental ABIEncoderV2;

import "./ExchangeAdapterInterface.sol";
import "../thirdparty/0x/Exchange.sol";
import "../../Fund.sol";
import "../../dependencies/DBC.sol";
import "../../dependencies/math.sol";


/// @title ZeroExV2Adapter Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Adapter between Melon and 0x Exchange Contract (version 1)
contract ZeroExV2Adapter is ExchangeAdapterInterface, DSMath, DBC, Asset {

    //  METHODS

    //  PUBLIC METHODS

    /// @notice Make order by pre-approving signatures
    function makeOrder(
        address targetExchange,
        address[6] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        bytes makerAssetData,
        bytes takerAssetData,
        bytes signature
    ) {
        require(Fund(address(this)).owner() == msg.sender);
        require(!Fund(address(this)).isShutDown());

        LibOrder.Order memory order = constructOrderStruct(orderAddresses, orderValues, makerAssetData, takerAssetData);
        address makerAsset = orderAddresses[2];
        address takerAsset = orderAddresses[3];

        require(makeOrderPermitted(order.makerAssetAmount, makerAsset, order.takerAssetAmount, takerAsset));
        Fund(address(this)).quantityHeldInCustodyOfExchange(address(makerAsset));
        require(!Fund(address(this)).isInOpenMakeOrder(makerAsset));

        approveMakerAsset(targetExchange, makerAsset, makerAssetData, order.makerAssetAmount);
        LibOrder.OrderInfo memory orderInfo = Exchange(targetExchange).getOrderInfo(order);
        Exchange(targetExchange).preSign(orderInfo.orderHash, address(this), signature);
        
        require(
            Exchange(targetExchange).isValidSignature(
                orderInfo.orderHash,
                address(this),
                signature
            ),
            "INVALID_ORDER_SIGNATURE"
         );
        require(
            Fund(address(this)).isInAssetList(takerAsset) ||
            Fund(address(this)).getOwnedAssetsLength() < Fund(address(this)).MAX_FUND_ASSETS()
        );

        Fund(address(this)).addOpenMakeOrder(targetExchange, makerAsset, uint256(orderInfo.orderHash));
        Fund(address(this)).addAssetToOwnedAssets(takerAsset);
        Fund(address(this)).orderUpdateHook(
            targetExchange,
            orderInfo.orderHash,
            Fund.UpdateType.make,
            [address(makerAsset), address(takerAsset)],
            [order.makerAssetAmount, order.takerAssetAmount, uint(0)]
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
    /// @param orderAddresses [0] Order maker
    /// @param orderAddresses [1] Order taker
    /// @param orderAddresses [2] Order maker asset
    /// @param orderAddresses [3] Order taker asset
    /// @param orderAddresses [4] feeRecipientAddress
    /// @param orderAddresses [5] senderAddress
    /// @param orderValues [0] makerAssetAmount
    /// @param orderValues [1] takerAssetAmount
    /// @param orderValues [2] Maker fee
    /// @param orderValues [3] Taker fee
    /// @param orderValues [4] expirationTimeSeconds
    /// @param orderValues [5] Salt/nonce
    /// @param orderValues [6] Fill amount: amount of taker token to be traded
    /// @param orderValues [7] Dexy signature mode
    /// @param identifier Order identifier
    /// @param makerAssetData Encoded data specific to makerAsset.
    /// @param takerAssetData Encoded data specific to takerAsset.
    /// @param signature Signature of the order.
    function takeOrder(
        address targetExchange,
        address[6] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        bytes makerAssetData,
        bytes takerAssetData,
        bytes signature
    ) {
        require(Fund(address(this)).owner() == msg.sender);
        require(!Fund(address(this)).isShutDown());

        LibOrder.Order memory order = constructOrderStruct(orderAddresses, orderValues, makerAssetData, takerAssetData);
        address makerAsset = orderAddresses[2];
        address takerAsset = orderAddresses[3];
        uint fillTakerQuantity = orderValues[6];
        uint fillMakerQuantity = mul(fillTakerQuantity, order.makerAssetAmount) / order.takerAssetAmount;

        require(takeOrderPermitted(fillTakerQuantity, takerAsset, fillMakerQuantity, makerAsset));
        
        approveTakerAsset(targetExchange, takerAsset, takerAssetData, fillTakerQuantity);
        LibOrder.OrderInfo memory orderInfo = Exchange(targetExchange).getOrderInfo(order);
        uint takerAssetFilledAmount = executeFill(targetExchange, order, fillTakerQuantity, signature);

        require(takerAssetFilledAmount == fillTakerQuantity);
        require(
            Fund(address(this)).isInAssetList(makerAsset) ||
            Fund(address(this)).getOwnedAssetsLength() < Fund(address(this)).MAX_FUND_ASSETS()
        );

        Fund(address(this)).addAssetToOwnedAssets(makerAsset);
        Fund(address(this)).orderUpdateHook(
            targetExchange,
            orderInfo.orderHash,
            Fund.UpdateType.take,
            [makerAsset, takerAsset],
            [order.makerAssetAmount, order.takerAssetAmount, fillTakerQuantity]
        );
    }

    /// @notice Cancel the 0x make order
    function cancelOrder(
        address targetExchange,
        address[6] orderAddresses,
        uint[8] orderValues,
        bytes32 identifier,
        bytes makerAssetData,
        bytes takerAssetData,
        bytes signature
    ) {
        require(Fund(address(this)).owner() == msg.sender);
        require(!Fund(address(this)).isShutDown());

        address makerAsset = orderAddresses[2];
        LibOrder.Order memory order = constructOrderStruct(orderAddresses, orderValues, makerAssetData, takerAssetData);
        LibOrder.OrderInfo memory orderInfo = Exchange(targetExchange).getOrderInfo(order);
        Exchange(targetExchange).cancelOrder(order);

        // Set the approval back to 0
        approveMakerAsset(targetExchange, makerAsset, makerAssetData, 0);
        Fund(address(this)).removeOpenMakeOrder(targetExchange, makerAsset);
        Fund(address(this)).orderUpdateHook(
            targetExchange,
            orderInfo.orderHash,
            Fund.UpdateType.cancel,
            [address(0), address(0)],
            [uint(0), uint(0), uint(0)]
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

    // INTERNAL METHODS


    /// @notice needed to avoid stack too deep error
    function approveTakerAsset(address targetExchange, address takerAsset, bytes takerAssetData, uint fillTakerQuantity)
        internal
    {
        address assetProxy = getAssetProxy(targetExchange, takerAssetData);
        require(Asset(takerAsset).approve(assetProxy, fillTakerQuantity));
    }

    /// @notice needed to avoid stack too deep error
    function approveMakerAsset(address targetExchange, address makerAsset, bytes makerAssetData, uint makerQuantity)
        internal
    {
        address assetProxy = getAssetProxy(targetExchange, makerAssetData);
        require(Asset(makerAsset).approve(assetProxy, makerQuantity));
    }

    /// @dev needed to avoid stack too deep error
    function executeFill(
        address targetExchange,
        LibOrder.Order memory order,
        uint256 takerAssetFillAmount,
        bytes signature
    )
        internal
        returns (uint)
    {
        uint takerFee = order.takerFee;
        if (takerFee > 0) {
            bytes memory assetData = Exchange(targetExchange).ZRX_ASSET_DATA();
            address zrxProxy = getAssetProxy(targetExchange, assetData);
            require(Asset(getAssetAddress(assetData)).approve(zrxProxy, takerFee));
        }

        address makerAsset = getAssetAddress(order.makerAssetData);
        uint preMakerAssetBalance = Asset(makerAsset).balanceOf(this);
        
        LibFillResults.FillResults memory fillResults = Exchange(targetExchange).fillOrder(
            order,
            takerAssetFillAmount,
            signature
        );

        uint postMakerAssetBalance = Asset(makerAsset).balanceOf(this);
        require(postMakerAssetBalance == add(preMakerAssetBalance, fillResults.makerAssetFilledAmount));

        return fillResults.takerAssetFilledAmount;
    }

    // VIEW METHODS

    /// @dev needed to avoid stack too deep error
    function takeOrderPermitted(
        uint takerQuantity,
        address takerAsset,
        uint makerQuantity,
        address makerAsset
    )
        internal
        view
        returns (bool)
    {
        require(takerAsset != address(this) && makerAsset != address(this));
        require(makerAsset != takerAsset);
        // require(fillTakerQuantity <= maxTakerQuantity);
        var (pricefeed, , riskmgmt) = Fund(address(this)).modules();
        require(pricefeed.existsPriceOnAssetPair(takerAsset, makerAsset));
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

    /// @dev needed to avoid stack too deep error
    function makeOrderPermitted(
        uint makerQuantity,
        address makerAsset,
        uint takerQuantity,
        address takerAsset
    )
        internal
        view
        returns (bool)
    {
        require(takerAsset != address(this) && makerAsset != address(this));
        var (pricefeed, , riskmgmt) = Fund(address(this)).modules();
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

    function constructOrderStruct(
        address[6] orderAddresses,
        uint[8] orderValues,
        bytes makerAssetData,
        bytes takerAssetData
    )
        internal
        view
        returns (LibOrder.Order memory order)
    {
        order = LibOrder.Order({
            makerAddress: orderAddresses[0],
            takerAddress: orderAddresses[1],
            feeRecipientAddress: orderAddresses[4],
            senderAddress: orderAddresses[5],
            makerAssetAmount: orderValues[0],
            takerAssetAmount: orderValues[1],
            makerFee: orderValues[2],
            takerFee: orderValues[3],
            expirationTimeSeconds: orderValues[4],
            salt: orderValues[5],
            makerAssetData: makerAssetData,
            takerAssetData: takerAssetData
        });
    }

    function getAssetProxy(address targetExchange, bytes assetData)
        internal
        view
        returns (address assetProxy)
    {
        bytes4 assetProxyId;
        assembly {
            assetProxyId := and(mload(
                add(assetData, 32)),
                0xFFFFFFFF00000000000000000000000000000000000000000000000000000000
            )
        }
        assetProxy = Exchange(targetExchange).getAssetProxy(assetProxyId);
    }

    function getAssetAddress(bytes assetData)
        internal
        view
        returns (address assetAddress)
    {
        assembly {
            assetAddress := mload(add(assetData, 36))
        }
    }
}