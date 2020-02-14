pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "../dependencies/token/IERC20.sol";
import "../fund/trading/Trading.sol";
import "../fund/hub/Hub.sol";
import "../fund/vault/Vault.sol";
import "../fund/accounting/Accounting.sol";
import "../dependencies/DSMath.sol";
import "./interfaces/IZeroExV2.sol";
import "./ExchangeAdapter.sol";

/// @title ZeroExV2Adapter Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Adapter to 0xV2 Exchange Contract
contract ZeroExV2Adapter is DSMath, ExchangeAdapter {
    /// @param orderAddresses [2] Order maker asset
    /// @param orderAddresses [3] Order taker asset
    /// @param orderData [0] Order maker asset data
    /// @param orderData [1] Order taker asset data
    modifier orderAddressesMatchOrderData(
        address[8] memory orderAddresses,
        bytes[4] memory orderData
    )
    {
        require(
            getAssetAddress(orderData[0]) == orderAddresses[2],
            "Maker asset data does not match order address in array"
        );
        require(
            getAssetAddress(orderData[1]) == orderAddresses[3],
            "Taker asset data does not match order address in array"
        );
        _;
    }

    //  METHODS

    //  PUBLIC METHODS

    /// @notice Make order by pre-approving signatures
    function makeOrder(
        address targetExchange,
        address[8] memory orderAddresses,
        uint[8] memory orderValues,
        bytes[4] memory orderData,
        bytes32 identifier,
        bytes memory signature
    )
        public
        override
        onlyManager
        notShutDown
        orderAddressesMatchOrderData(orderAddresses, orderData)
    {
        ensureCanMakeOrder(orderAddresses[2]);

        IZeroExV2.Order memory order = constructOrderStruct(orderAddresses, orderValues, orderData);
        address makerAsset = getAssetAddress(orderData[0]);
        address takerAsset = getAssetAddress(orderData[1]);

        // Order parameter checks
        getTrading().updateAndGetQuantityBeingTraded(makerAsset);
        ensureNotInOpenMakeOrder(makerAsset);

        approveAssetsMakeOrder(targetExchange, order);

        IZeroExV2.OrderInfo memory orderInfo = IZeroExV2(targetExchange).getOrderInfo(order);
        IZeroExV2(targetExchange).preSign(orderInfo.orderHash, address(this), signature);

        require(
            IZeroExV2(targetExchange).isValidSignature(
                orderInfo.orderHash,
                address(this),
                signature
            ),
            "INVALID_ORDER_SIGNATURE"
        );

        updateStateMakeOrder(targetExchange, order);
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
    /// @param orderData [0] Encoded data specific to maker asset
    /// @param orderData [1] Encoded data specific to taker asset
    /// @param orderData [2] Encoded data specific to maker asset fee
    /// @param orderData [3] Encoded data specific to taker asset fee
    /// @param identifier Order identifier
    /// @param signature Signature of the order.
    function takeOrder(
        address targetExchange,
        address[8] memory orderAddresses,
        uint[8] memory orderValues,
        bytes[4] memory orderData,
        bytes32 identifier,
        bytes memory signature
    )
        public
        override
        onlyManager
        notShutDown
        orderAddressesMatchOrderData(orderAddresses, orderData)
    {
        IZeroExV2.Order memory order = constructOrderStruct(orderAddresses, orderValues, orderData);

        uint fillTakerQuantity = orderValues[6];

        approveAssetsTakeOrder(targetExchange, order);

        uint takerAssetFilledAmount = executeFill(targetExchange, order, fillTakerQuantity, signature);
        require(
            takerAssetFilledAmount == fillTakerQuantity,
            "Filled amount does not match desired fill amount"
        );

        updateStateTakeOrder(targetExchange, order, fillTakerQuantity);
    }

    /// @notice Cancel the 0x make order
    function cancelOrder(
        address targetExchange,
        address[8] memory orderAddresses,
        uint[8] memory orderValues,
        bytes[4] memory orderData,
        bytes32 identifier,
        bytes memory signature
    )
        public
        override
        orderAddressesMatchOrderData(orderAddresses, orderData)
    {
        IZeroExV2.Order memory order = getTrading().getZeroExV2OrderDetails(identifier);
        ensureCancelPermitted(targetExchange, orderAddresses[2], identifier);

        if (order.expirationTimeSeconds > block.timestamp) {
            IZeroExV2(targetExchange).cancelOrder(order);
        }

        revokeApproveAssetsCancelOrder(targetExchange, order);

        updateStateCancelOrder(targetExchange, order);
    }

    /// @dev Get order details
    function getOrder(address targetExchange, uint256 id, address makerAsset)
        public
        view
        override
        returns (address, address, uint256, uint256)
    {
        uint orderId;
        uint orderIndex;
        address takerAsset;
        uint makerQuantity;
        uint takerQuantity;
        (orderId, , orderIndex) = Trading(msg.sender).getOpenOrderInfo(targetExchange, makerAsset);
        (, takerAsset, makerQuantity, takerQuantity) = Trading(msg.sender).getOrderDetails(orderIndex);
        uint takerAssetFilledAmount = IZeroExV2(targetExchange).filled(bytes32(orderId));
        uint makerAssetFilledAmount = mul(takerAssetFilledAmount, makerQuantity) / takerQuantity;
        if (IZeroExV2(targetExchange).cancelled(bytes32(orderId)) || sub(takerQuantity, takerAssetFilledAmount) == 0) {
            return (makerAsset, takerAsset, 0, 0);
        }
        return (
            makerAsset,
            takerAsset,
            sub(makerQuantity, makerAssetFilledAmount),
            sub(takerQuantity, takerAssetFilledAmount)
        );
    }

    // INTERNAL METHODS

    /// @notice Approves makerAsset, makerFee
    function approveAssetsMakeOrder(address _targetExchange, IZeroExV2.Order memory _order)
        internal
    {
        approveAsset(
            getAssetAddress(_order.makerAssetData),
            getAssetProxy(_targetExchange, _order.makerAssetData),
            _order.makerAssetAmount,
            "makerAsset"
        );
        if (_order.makerFee > 0) {
            bytes memory zrxAssetData = IZeroExV2(_targetExchange).ZRX_ASSET_DATA();
            approveAsset(
                getAssetAddress(zrxAssetData),
                getAssetProxy(_targetExchange, zrxAssetData),
                _order.makerFee,
                "makerFeeAsset"
            );
        }
    }

    /// @notice Approves takerAsset, takerFee
    function approveAssetsTakeOrder(address _targetExchange, IZeroExV2.Order memory _order)
        internal
    {
        approveAsset(
            getAssetAddress(_order.takerAssetData),
            getAssetProxy(_targetExchange, _order.takerAssetData),
            _order.takerAssetAmount,
            "takerAsset"
        );
        if (_order.takerFee > 0) {
            bytes memory zrxAssetData = IZeroExV2(_targetExchange).ZRX_ASSET_DATA();
            approveAsset(
                getAssetAddress(zrxAssetData),
                getAssetProxy(_targetExchange, zrxAssetData),
                _order.takerFee,
                "takerFeeAsset"
            );
        }
    }

    /// @dev Needed to avoid stack too deep error
    function executeFill(
        address targetExchange,
        IZeroExV2.Order memory order,
        uint256 takerAssetFillAmount,
        bytes memory signature
    )
        internal
        returns (uint256)
    {
        address makerAsset = getAssetAddress(order.makerAssetData);
        uint preMakerAssetBalance = IERC20(makerAsset).balanceOf(address(this));

        IZeroExV2.FillResults memory fillResults = IZeroExV2(targetExchange).fillOrder(
            order,
            takerAssetFillAmount,
            signature
        );

        uint256 postMakerAssetBalance = IERC20(makerAsset).balanceOf(address(this));

        // Account for case where makerAsset is ZRX (same as takerFee)
        uint256 makerAssetFeesTotal;
        if (makerAsset == getAssetAddress(IZeroExV2(targetExchange).ZRX_ASSET_DATA())) {
            makerAssetFeesTotal = add(makerAssetFeesTotal, order.takerFee);
        }

        require(
            postMakerAssetBalance == sub(
                add(preMakerAssetBalance, fillResults.makerAssetFilledAmount),
                makerAssetFeesTotal
            ),
            "Maker asset balance different than expected"
        );

        return fillResults.takerAssetFilledAmount;
    }

    /// @notice Revoke asset approvals and return assets to vault
    function revokeApproveAssetsCancelOrder(
        address _targetExchange,
        IZeroExV2.Order memory _order
    )
        internal
    {
        address makerAsset = getAssetAddress(_order.makerAssetData);
        bytes memory makerFeeAssetData = IZeroExV2(_targetExchange).ZRX_ASSET_DATA();
        address makerFeeAsset = getAssetAddress(makerFeeAssetData);
        bytes32 orderHash = IZeroExV2(_targetExchange).getOrderInfo(_order).orderHash;
        uint takerAssetFilledAmount = IZeroExV2(_targetExchange).filled(orderHash);
        uint makerAssetFilledAmount = mul(takerAssetFilledAmount, _order.makerAssetAmount) / _order.takerAssetAmount;
        uint256 makerAssetRemainingInOrder = sub(_order.makerAssetAmount, makerAssetFilledAmount);
        uint256 makerFeeRemainingInOrder = mul(_order.makerFee, makerAssetRemainingInOrder) / _order.makerAssetAmount;

        revokeApproveAsset(
            makerAsset,
            getAssetProxy(_targetExchange, _order.makerAssetData),
            makerAssetRemainingInOrder,
            "makerAsset"
        );
        uint256 timesMakerAssetUsedAsFee = getTrading().openMakeOrdersUsingAssetAsFee(makerAsset);
        // only return makerAsset early when it is not being used as a fee anywhere
        if (timesMakerAssetUsedAsFee == 0) {
            getTrading().returnAssetToVault(makerAsset);
        }

        if (_order.makerFee > 0) {
            revokeApproveAsset(
                makerFeeAsset,
                getAssetProxy(_targetExchange, makerFeeAssetData),
                makerFeeRemainingInOrder,
                "makerFeeAsset"
            );
            // only return feeAsset when not used in another makeOrder AND
            //  when it is only used as a fee in this order that we are cancelling
            uint256 timesFeeAssetUsedAsFee = getTrading().openMakeOrdersUsingAssetAsFee(makerFeeAsset);
            if (
                !getTrading().isInOpenMakeOrder(makerFeeAsset) &&
                timesFeeAssetUsedAsFee == 1
            ) {
                getTrading().returnAssetToVault(makerFeeAsset);
            }
        }
    }

    /// @dev Avoids stack too deep error
    function updateStateCancelOrder(address targetExchange, IZeroExV2.Order memory order)
        internal
    {
        address makerAsset = getAssetAddress(order.makerAssetData);

        getTrading().removeOpenMakeOrder(targetExchange, makerAsset);
        getAccounting().updateOwnedAssets();
        getTrading().orderUpdateHook(
            targetExchange,
            IZeroExV2(targetExchange).getOrderInfo(order).orderHash,
            Trading.UpdateType.cancel,
            [address(0), address(0)],
            [uint(0), uint(0), uint(0)]
        );
    }

    /// @dev Avoids stack too deep error
    function updateStateMakeOrder(address targetExchange, IZeroExV2.Order memory order)
        internal
    {
        address makerAsset = getAssetAddress(order.makerAssetData);
        address takerAsset = getAssetAddress(order.takerAssetData);
        IZeroExV2.OrderInfo memory orderInfo = IZeroExV2(targetExchange).getOrderInfo(order);

        getAccounting().addAssetToOwnedAssets(takerAsset);
        getTrading().orderUpdateHook(
            targetExchange,
            orderInfo.orderHash,
            Trading.UpdateType.make,
            [payable(makerAsset), payable(takerAsset)],
            [order.makerAssetAmount, order.takerAssetAmount, uint(0)]
        );
        getTrading().addOpenMakeOrder(
            targetExchange,
            makerAsset,
            takerAsset,
            getAssetAddress(IZeroExV2(targetExchange).ZRX_ASSET_DATA()),
            uint256(orderInfo.orderHash),
            order.expirationTimeSeconds
        );
        getTrading().addZeroExV2OrderData(orderInfo.orderHash, order);
    }

    /// @dev avoids stack too deep error
    function updateStateTakeOrder(
        address targetExchange,
        IZeroExV2.Order memory order,
        uint256 fillTakerQuantity
    )
        internal
    {
        address makerAsset = getAssetAddress(order.makerAssetData);
        address takerAsset = getAssetAddress(order.takerAssetData);

        getAccounting().addAssetToOwnedAssets(makerAsset);
        getAccounting().updateOwnedAssets();
        if (
            !getTrading().isInOpenMakeOrder(makerAsset) &&
            getTrading().openMakeOrdersUsingAssetAsFee(makerAsset) == 0
        ) {
            getTrading().returnAssetToVault(makerAsset);
        }
        getTrading().orderUpdateHook(
            targetExchange,
            IZeroExV2(targetExchange).getOrderInfo(order).orderHash,
            Trading.UpdateType.take,
            [payable(makerAsset), payable(takerAsset)],
            [order.makerAssetAmount, order.takerAssetAmount, fillTakerQuantity]
        );
    }

    // VIEW METHODS

    function constructOrderStruct(
        address[8] memory orderAddresses,
        uint[8] memory orderValues,
        bytes[4] memory orderData
    )
        internal
        view
        returns (IZeroExV2.Order memory order)
    {
        order = IZeroExV2.Order({
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
            makerAssetData: orderData[0],
            takerAssetData: orderData[1]
        });
    }

    function getAssetProxy(address targetExchange, bytes memory assetData)
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
        assetProxy = IZeroExV2(targetExchange).getAssetProxy(assetProxyId);
    }

    function getAssetAddress(bytes memory assetData)
        internal
        view
        returns (address assetAddress)
    {
        assembly {
            assetAddress := mload(add(assetData, 36))
        }
    }
}
