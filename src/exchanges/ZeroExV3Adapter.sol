pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "./ExchangeAdapter.sol";
import "./interfaces/IZeroExV3.sol";
import "./OrderFiller.sol";
import "../dependencies/DSMath.sol";

/// @title ZeroExV3Adapter Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Adapter to 0xV3 Exchange Contract
contract ZeroExV3Adapter is DSMath, ExchangeAdapter, OrderFiller {

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

        (
            address[] memory fillAssets,
            uint256[] memory fillExpectedAmounts
        ) = formatFillTakeOrderArgs(
            _targetExchange,
            _orderAddresses,
            _orderValues
        );

        fillTakeOrder(
            _targetExchange,
            fillAssets,
            fillExpectedAmounts,
            order,
            _signature
        );
    }

    // INTERNAL METHODS

    /// @notice Approves takerAsset, takerFeeAsset, protocolFee
    function approveAssetsTakeOrder(
        address _targetExchange,
        IZeroExV3.Order memory _order,
        uint256[] memory _fillExpectedAmounts
    )
        internal
    {
        approveProtocolFeeAsset(_targetExchange);
        uint256 takerFeeAmount = mul(_order.takerFee, _fillTakerAmount) / _order.takerAssetAmount;
        approveAsset(
            getAssetAddress(_order.takerAssetData),
            getAssetProxy(_targetExchange, _order.takerAssetData),
            _fillExpectedAmounts[1],
            "takerAsset"
        );
        if (takerFeeAmount > 0) {
            approveAsset(
                getAssetAddress(_order.takerFeeAssetData),
                getAssetProxy(_targetExchange, _order.takerFeeAssetData),
                _fillExpectedAmounts[3],
                "takerFeeAsset"
            );
        }
    }

    function approveProtocolFeeAsset(address _targetExchange) internal {
        address protocolFeeCollector = IZeroExV3(_targetExchange).protocolFeeCollector();
        uint256 protocolFeeAmount = calcProtocolFeeAmount(_targetExchange);
        if (protocolFeeCollector == address(0) || protocolFeeAmount == 0) return;

        approveAsset(getNativeAssetAddress(), protocolFeeCollector, protocolFeeAmount, "protocolFee");
    }

    function fillTakeOrder(
        address _targetExchange,
        address[] memory _fillAssets,
        uint256[] memory _fillExpectedAmounts,
        IZeroExV3.Order memory _order,
        bytes memory _signature
    )
        internal
        validateAndFinalizeFilledOrder(
            _targetExchange,
            _fillAssets,
            _fillExpectedAmounts
        )
    {
        // Approve taker and taker fee assets
        approveAssetsTakeOrder(_targetExchange, _order, _fillExpectedAmounts);

        // Execute take order on exchange
        IZeroExV3(_targetExchange).fillOrder(_order, _fillExpectedAmounts[1], _signature);
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

    function formatFillTakeOrderArgs(
        address _targetExchange,
        address[8] memory _orderAddresses,
        uint256[8] memory _orderValues
    )
        internal
        view
        returns (address[] memory, uint256[] memory)
    {
        address[] memory fillAssets = new address[](4);
        fillAssets[0] = _orderAddresses[2]; // maker asset
        fillAssets[1] = _orderAddresses[3]; // taker asset
        fillAssets[2] = getNativeAssetAddress(); // protocol fee
        fillAssets[3] = _orderAddresses[7]; // taker fee asset

        uint256[] memory fillExpectedAmounts = new uint256[](4);
        fillExpectedAmounts[0] = _orderValues[0]; // maker fill amount
        fillExpectedAmounts[1] = _orderValues[1]; // taker fill amount
        fillExpectedAmounts[2] = calcProtocolFeeAmount(_targetExchange); // protocol fee
        fillExpectedAmounts[3] = _orderValues[3]; // taker fee amount

        return (fillAssets, fillExpectedAmounts);
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
