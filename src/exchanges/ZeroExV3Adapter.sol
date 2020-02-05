pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "../dependencies/token/IERC20.sol";
import "../fund/trading/Trading.sol";
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

        completeTakeOrder(_targetExchange, order, _orderValues[0], takerAssetFilledAmount);
    }

    // INTERNAL METHODS

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
        address nativeAsset = getAccounting().NATIVE_ASSET();

        approveAsset(nativeAsset, protocolFeeCollector, protocolFeeAmount, "protocolFee");
    }

    /// @dev Needed to avoid stack too deep error
    function completeTakeOrder(
        address _targetExchange,
        IZeroExV3.Order memory _order,
        uint256 _makerAssetFilledAmount,
        uint256 _takerAssetFilledAmount
    )
        internal
    {
        address makerAsset = getAssetAddress(_order.makerAssetData);
        address takerAsset = getAssetAddress(_order.takerAssetData);

        getAccounting().decreaseAssetBalance(takerAsset, _takerAssetFilledAmount);
        getAccounting().increaseAssetBalance(makerAsset, _makerAssetFilledAmount);

        address[] memory takerFeeAssets = new address[](2);
        takerFeeAssets[0] = getAccounting().NATIVE_ASSET();
        takerFeeAssets[1] = getAssetAddress(_order.takerFeeAssetData);
        uint256[] memory takerFeeAmounts = new uint256[](2);
        takerFeeAmounts[0] = calcProtocolFeeAmount(_targetExchange);
        takerFeeAmounts[1] = _order.takerFee;

        emit OrderFilled(
            _targetExchange,
            OrderType.Take,
            makerAsset,
            _makerAssetFilledAmount,
            takerAsset,
            _takerAssetFilledAmount,
            takerFeeAssets,
            takerFeeAmounts
        );
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
            makerAsset == getAccounting().NATIVE_ASSET() &&
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
