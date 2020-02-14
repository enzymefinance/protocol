pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "../dependencies/token/IERC20.sol";
import "../fund/trading/Trading.sol";
import "../fund/hub/Hub.sol";
import "../fund/vault/Vault.sol";
import "../fund/accounting/Accounting.sol";
import "../dependencies/DSMath.sol";
import "./interfaces/IZeroExV3.sol";
import "./ExchangeAdapter.sol";

/// @title ZeroExV3Adapter Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Adapter to 0xV3 Exchange Contract
contract ZeroExV3Adapter is DSMath, ExchangeAdapter {

    /// @param _orderAddresses [2] Order maker asset
    /// @param _orderAddresses [3] Order taker asset
    /// @param _orderAddresses [6] Order maker fee asset
    /// @param _orderAddresses [7] Order taker fee asset
    /// @param _orderValues [2] Order maker fee amount
    /// @param _orderValues [3] Order taker fee amount
    modifier orderAddressesMatchOrderData(
        address[8] memory _orderAddresses,
        uint[8] memory _orderValues,
        bytes[4] memory _orderData
    )
    {
        require(
            getAssetAddress(_orderData[0]) == _orderAddresses[2],
            "Maker asset data does not match order address in array"
        );
        require(
            getAssetAddress(_orderData[1]) == _orderAddresses[3],
            "Taker asset data does not match order address in array"
        );
        if (_orderValues[2] > 0) {
            require(
                getAssetAddress(_orderData[2]) == _orderAddresses[6],
                "Maker fee asset data does not match order address in array"
            );
        }
        if (_orderValues[3] > 0) {
            require(
                getAssetAddress(_orderData[3]) == _orderAddresses[7],
                "Taker fee asset data does not match order address in array"
            );
        }
        _;
    }

    //  METHODS

    //  PUBLIC METHODS

    /// @notice Make order by pre-approving signatures
    /// @param _targetExchange Address of the exchange
    /// @param _orderAddresses [2] Maker asset (Dest token)
    /// @param _orderAddresses [3] Taker asset (Src token)
    /// @param _orderData [0] Encoded data specific to maker asset
    /// @param _orderData [1] Encoded data specific to taker asset
    /// @param _signature _signature of the order.
    function makeOrder(
        address _targetExchange,
        address[8] memory _orderAddresses,
        uint[8] memory _orderValues,
        bytes[4] memory _orderData,
        bytes32 _identifier,
        bytes memory _signature
    )
        public
        override
        onlyManager
        notShutDown
        orderAddressesMatchOrderData(_orderAddresses, _orderValues, _orderData)
    {
        ensureCanMakeOrder(_orderAddresses[2]);

        IZeroExV3.Order memory order = constructOrderStruct(_orderAddresses, _orderValues, _orderData);
        address makerAsset = getAssetAddress(_orderData[0]);
        address takerAsset = getAssetAddress(_orderData[1]);

        // Order parameter checks
        getTrading().updateAndGetQuantityBeingTraded(makerAsset);
        ensureNotInOpenMakeOrder(makerAsset);

        approveAssetsMakeOrder(_targetExchange, order);

        IZeroExV3.OrderInfo memory orderInfo = IZeroExV3(_targetExchange).getOrderInfo(order);
        IZeroExV3(_targetExchange).preSign(orderInfo.orderHash);

        require(
            IZeroExV3(_targetExchange).isValidOrderSignature(order, _signature),
            "INVALID_ORDER_SIGNATURE"
        );

        updateStateMakeOrder(_targetExchange, order);
    }

    /// @notice Takes an active order on the selected exchange
    /// @dev These orders are expected to settle immediately
    /// @param _targetExchange Address of the exchange
    /// @param _orderAddresses [2] Order maker asset
    /// @param _orderAddresses [3] Order taker asset
    /// @param _orderValues [6] Fill amount: amount of taker token to be traded
    /// @param _signature _signature of the order.
    function takeOrder(
        address _targetExchange,
        address[8] memory _orderAddresses,
        uint[8] memory _orderValues,
        bytes[4] memory _orderData,
        bytes32 _identifier,
        bytes memory _signature
    )
        public
        override
        onlyManager
        notShutDown
        orderAddressesMatchOrderData(_orderAddresses, _orderValues, _orderData)
    {
        IZeroExV3.Order memory order = constructOrderStruct(_orderAddresses, _orderValues, _orderData);
        require(IZeroExV3(_targetExchange).isValidOrderSignature(order, _signature), "Order _signature is invalid");

        uint256 fillTakerQuantity = _orderValues[6];

        approveAssetsTakeOrder(_targetExchange, order);

        uint256 takerAssetFilledAmount = executeFill(_targetExchange, order, fillTakerQuantity, _signature);
        require(
            takerAssetFilledAmount == fillTakerQuantity,
            "Filled amount does not match desired fill amount"
        );

        updateStateTakeOrder(_targetExchange, order, fillTakerQuantity);
    }

    /// @notice Cancel the 0x make order
    /// @param _targetExchange Address of the exchange
    /// @param _orderAddresses [2] Order maker asset
    /// @param _identifier Order _identifier
    function cancelOrder(
        address _targetExchange,
        address[8] memory _orderAddresses,
        uint[8] memory _orderValues,
        bytes[4] memory _orderData,
        bytes32 _identifier,
        bytes memory _signature
    )
        public
        override
        orderAddressesMatchOrderData(_orderAddresses, _orderValues, _orderData)
    {
        IZeroExV3.Order memory order = getTrading().getZeroExV3OrderDetails(_identifier);
        ensureCancelPermitted(_targetExchange, getAssetAddress(order.makerAssetData), _identifier);
        if (order.expirationTimeSeconds > block.timestamp) {
            IZeroExV3(_targetExchange).cancelOrder(order);
        }

        revokeApproveAssetsCancelOrder(_targetExchange, order);

        updateStateCancelOrder(_targetExchange, order);
    }

    /// @dev Get order details
    function getOrder(address _targetExchange, uint256 _id, address _makerAsset)
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
        (orderId, , orderIndex) = Trading(msg.sender).getOpenOrderInfo(_targetExchange, _makerAsset);
        (, takerAsset, makerQuantity, takerQuantity) = Trading(msg.sender).getOrderDetails(orderIndex);
        uint takerAssetFilledAmount = IZeroExV3(_targetExchange).filled(bytes32(orderId));
        uint makerAssetFilledAmount = mul(takerAssetFilledAmount, makerQuantity) / takerQuantity;
        if (IZeroExV3(_targetExchange).cancelled(bytes32(orderId)) || sub(takerQuantity, takerAssetFilledAmount) == 0) {
            return (_makerAsset, takerAsset, 0, 0);
        }
        return (
            _makerAsset,
            takerAsset,
            sub(makerQuantity, makerAssetFilledAmount),
            sub(takerQuantity, takerAssetFilledAmount)
        );
    }

    // INTERNAL METHODS

    /// @notice Approves makerAsset, makerFeeAsset
    function approveAssetsMakeOrder(address _targetExchange, IZeroExV3.Order memory _order)
        internal
    {
        approveAsset(
            getAssetAddress(_order.makerAssetData),
            getAssetProxy(_targetExchange, _order.makerAssetData),
            _order.makerAssetAmount,
            "makerAsset"
        );
        if (_order.makerFee > 0) {
            approveAsset(
                getAssetAddress(_order.makerFeeAssetData),
                getAssetProxy(_targetExchange, _order.makerFeeAssetData),
                _order.makerFee,
                "makerFeeAsset"
            );
        }
    }

    /// @notice Approves takerAsset, takerFeeAsset, protocolFee
    function approveAssetsTakeOrder(address _targetExchange, IZeroExV3.Order memory _order)
        internal
    {
        approveProtocolFeeAsset(_targetExchange);
        approveAsset(
            getAssetAddress(_order.takerAssetData),
            getAssetProxy(_targetExchange, _order.takerAssetData),
            _order.takerAssetAmount,
            "takerAsset"
        );
        if (_order.takerFee > 0) {
            approveAsset(
                getAssetAddress(_order.takerFeeAssetData),
                getAssetProxy(_targetExchange, _order.takerFeeAssetData),
                _order.takerFee,
                "takerFeeAsset"
            );
        }
    }

    function approveProtocolFeeAsset(address _targetExchange) internal {
        address protocolFeeCollector = IZeroExV3(_targetExchange).protocolFeeCollector();
        uint256 protocolFeeAmount = calcProtocolFeeAmount(_targetExchange);
        if (protocolFeeCollector == address(0) || protocolFeeAmount == 0) return;

        Hub hub = getHub();
        address nativeAsset = Accounting(hub.accounting()).NATIVE_ASSET();

        approveAsset(nativeAsset, protocolFeeCollector, protocolFeeAmount, "protocolFee");
    }

    /// @dev Needed to avoid stack too deep error
    function executeFill(
        address _targetExchange,
        IZeroExV3.Order memory _order,
        uint256 _takerAssetFillAmount,
        bytes memory _signature
    )
        internal
        returns (uint256)
    {
        Hub hub = getHub();
        address makerAsset = getAssetAddress(_order.makerAssetData);
        uint preMakerAssetBalance = IERC20(makerAsset).balanceOf(address(this));

        IZeroExV3.FillResults memory fillResults = IZeroExV3(_targetExchange).fillOrder(
            _order,
            _takerAssetFillAmount,
            _signature
        );

        uint256 postMakerAssetBalance = IERC20(makerAsset).balanceOf(address(this));

        // Account for case where makerAsset, takerFee, protocolFee are the same
        uint256 makerAssetFeesTotal;
        if (
            makerAsset == Accounting(hub.accounting()).NATIVE_ASSET() &&
            IZeroExV3(_targetExchange).protocolFeeCollector() != address(0)
        )
        {
            makerAssetFeesTotal = calcProtocolFeeAmount(_targetExchange);
        }
        if (makerAsset == getAssetAddress(_order.takerFeeAssetData)) {
            makerAssetFeesTotal = add(makerAssetFeesTotal, _order.takerFee);
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
        IZeroExV3.Order memory _order
    )
        internal
    {
        address makerAsset = getAssetAddress(_order.makerAssetData);
        address makerFeeAsset = getAssetAddress(_order.makerFeeAssetData);
        bytes32 orderHash = IZeroExV3(_targetExchange).getOrderInfo(_order).orderHash;
        uint takerAssetFilledAmount = IZeroExV3(_targetExchange).filled(orderHash);
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
                getAssetProxy(_targetExchange, _order.makerFeeAssetData),
                makerFeeRemainingInOrder,
                "makerFeeAsset"
            );
            // only return feeAsset when not used in another makeOrder AND
            //  when it is only used as a fee in this order that we are cancelling
            uint256 timesFeeAssetUsedAsFee = getTrading().openMakeOrdersUsingAssetAsFee(makerFeeAsset);
            if (
                !getTrading().isInOpenMakeOrder(makerFeeAsset) &&
                timesFeeAssetUsedAsFee == 1
            ) getTrading().returnAssetToVault(makerFeeAsset);
        }
    }

    function updateStateCancelOrder(address _targetExchange, IZeroExV3.Order memory _order)
        internal
    {
        address makerAsset = getAssetAddress(_order.makerAssetData);

        getTrading().removeOpenMakeOrder(_targetExchange, makerAsset);
        getAccounting().updateOwnedAssets();
        getTrading().orderUpdateHook(
            _targetExchange,
            IZeroExV3(_targetExchange).getOrderInfo(_order).orderHash,
            Trading.UpdateType.cancel,
            [address(0), address(0)],
            [uint(0), uint(0), uint(0)]
        );
    }

    function updateStateMakeOrder(address _targetExchange, IZeroExV3.Order memory _order)
        internal
    {
        address makerAsset = getAssetAddress(_order.makerAssetData);
        address takerAsset = getAssetAddress(_order.takerAssetData);
        IZeroExV3.OrderInfo memory orderInfo = IZeroExV3(_targetExchange).getOrderInfo(_order);

        getAccounting().addAssetToOwnedAssets(takerAsset);
        getTrading().orderUpdateHook(
            _targetExchange,
            orderInfo.orderHash,
            Trading.UpdateType.make,
            [payable(makerAsset), payable(takerAsset)],
            [_order.makerAssetAmount, _order.takerAssetAmount, uint(0)]
        );
        getTrading().addOpenMakeOrder(
            _targetExchange,
            makerAsset,
            takerAsset,
            getAssetAddress(_order.makerFeeAssetData),
            uint256(orderInfo.orderHash),
            _order.expirationTimeSeconds
        );
        getTrading().addZeroExV3OrderData(orderInfo.orderHash, _order);
    }

    /// @dev Avoids stack too deep error
    function updateStateTakeOrder(
        address _targetExchange,
        IZeroExV3.Order memory _order,
        uint256 _fillTakerQuantity
    )
        internal
    {
        address makerAsset = getAssetAddress(_order.makerAssetData);
        address takerAsset = getAssetAddress(_order.takerAssetData);

        getAccounting().addAssetToOwnedAssets(makerAsset);
        getAccounting().updateOwnedAssets();
        if (
            !getTrading().isInOpenMakeOrder(makerAsset) &&
            getTrading().openMakeOrdersUsingAssetAsFee(makerAsset) == 0
        ) {
            getTrading().returnAssetToVault(makerAsset);
        }
        getTrading().orderUpdateHook(
            _targetExchange,
            IZeroExV3(_targetExchange).getOrderInfo(_order).orderHash,
            Trading.UpdateType.take,
            [payable(makerAsset), payable(takerAsset)],
            [_order.makerAssetAmount, _order.takerAssetAmount, _fillTakerQuantity]
        );
    }

    // VIEW METHODS
    function calcProtocolFeeAmount(address _targetExchange) internal view returns (uint256) {
        return mul(IZeroExV3(_targetExchange).protocolFeeMultiplier(), tx.gasprice);
    }

    function constructOrderStruct(
        address[8] memory _orderAddresses,
        uint[8] memory _orderValues,
        bytes[4] memory _orderData
    )
        internal
        view
        returns (IZeroExV3.Order memory order_)
    {
        order_ = IZeroExV3.Order({
            makerAddress: _orderAddresses[0],
            takerAddress: _orderAddresses[1],
            feeRecipientAddress: _orderAddresses[4],
            senderAddress: _orderAddresses[5],
            makerAssetAmount: _orderValues[0],
            takerAssetAmount: _orderValues[1],
            makerFee: _orderValues[2],
            takerFee: _orderValues[3],
            expirationTimeSeconds: _orderValues[4],
            salt: _orderValues[5],
            makerAssetData: _orderData[0],
            takerAssetData: _orderData[1],
            makerFeeAssetData: _orderData[2],
            takerFeeAssetData: _orderData[3]
        });
    }

    function getAssetProxy(address _targetExchange, bytes memory _assetData)
        internal
        view
        returns (address assetProxy_)
    {
        bytes4 assetProxyId;
        assembly {
            assetProxyId := and(mload(
                add(_assetData, 32)),
                0xFFFFFFFF00000000000000000000000000000000000000000000000000000000
            )
        }
        assetProxy_ = IZeroExV3(_targetExchange).getAssetProxy(assetProxyId);
    }

    function getAssetAddress(bytes memory _assetData)
        internal
        view
        returns (address assetAddress_)
    {
        assembly {
            assetAddress_ := mload(add(_assetData, 36))
        }
    }
}
