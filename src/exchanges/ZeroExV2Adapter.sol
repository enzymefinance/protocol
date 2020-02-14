pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "./ExchangeAdapter.sol";
import "./OrderFiller.sol";
import "./interfaces/IZeroExV2.sol";

/// @title ZeroExV2Adapter Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Adapter to 0xV2 Exchange Contract
contract ZeroExV2Adapter is ExchangeAdapter, OrderFiller {
    /// @notice Takes an active order on 0x v2
    /// @param _orderAddresses [0] Order param: makerAddress
    /// @param _orderAddresses [1] Order param: takerAddress
    /// @param _orderAddresses [2] Maker asset
    /// @param _orderAddresses [3] Taker asset
    /// @param _orderAddresses [4] Order param: feeRecipientAddress
    /// @param _orderAddresses [5] Order param: senderAddress
    /// @param _orderData [0] Order param: makerAssetData
    /// @param _orderData [1] Order param: takerAssetData
    /// @param _orderValues [0] Order param: makerAssetAmount
    /// @param _orderValues [1] Order param: takerAssetAmount
    /// @param _orderValues [2] Order param: makerFee
    /// @param _orderValues [3] Order param: takerFee
    /// @param _orderValues [4] Order param: expirationTimeSeconds
    /// @param _orderValues [5] Order param: salt
    /// @param _orderValues [6] Taker asset fill quantity
    /// @param _identifier Order identifier
    /// @param _signature Signature of the order
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
    {
        validateTakeOrderParams(_orderAddresses, _orderValues, _orderData);

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
            constructOrderStruct(_orderAddresses, _orderValues, _orderData),
            _signature
        );
    }

    // INTERNAL METHODS

    // Approves takerAsset, takerFee
    function approveAssetsTakeOrder(
        address _targetExchange,
        IZeroExV2.Order memory _order,
        uint256[] memory _fillExpectedAmounts
    )
        internal
    {
        // Taker asset
        approveAsset(
            getAssetAddress(_order.takerAssetData),
            getAssetProxy(_targetExchange, _order.takerAssetData),
            _fillExpectedAmounts[1],
            "takerAsset"
        );
        // Taker fee asset
        if (_order.takerFee > 0) {
            bytes memory zrxAssetData = IZeroExV2(_targetExchange).ZRX_ASSET_DATA();
            approveAsset(
                getAssetAddress(zrxAssetData),
                getAssetProxy(_targetExchange, zrxAssetData),
                _fillExpectedAmounts[2],
                "takerFeeAsset"
            );
        }
    }

    function constructOrderStruct(
        address[8] memory _orderAddresses,
        uint[8] memory _orderValues,
        bytes[4] memory _orderData
    )
        internal
        pure
        returns (IZeroExV2.Order memory order)
    {
        order = IZeroExV2.Order({
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
            takerAssetData: _orderData[1]
        });
    }

    function fillTakeOrder(
        address _targetExchange,
        address[] memory _fillAssets,
        uint256[] memory _fillExpectedAmounts,
        IZeroExV2.Order memory _order,
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
        IZeroExV2(_targetExchange).fillOrder(_order, _fillExpectedAmounts[1], _signature);
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
        address[] memory fillAssets = new address[](3);
        fillAssets[0] = _orderAddresses[2]; // maker asset
        fillAssets[1] = _orderAddresses[3]; // taker asset
        fillAssets[2] = getAssetAddress(IZeroExV2(_targetExchange).ZRX_ASSET_DATA()); // taker fee asset

        uint256[] memory fillExpectedAmounts = new uint256[](3);
        fillExpectedAmounts[0] = calculateExpectedFillAmount(
            _orderValues[1],
            _orderValues[0],
            _orderValues[6]
        ); // maker fill amount; calculated relative to taker fill amount
        fillExpectedAmounts[1] = _orderValues[6]; // taker fill amount
        fillExpectedAmounts[2] = calculateExpectedFillAmount(
            _orderValues[1],
            _orderValues[3],
            _orderValues[6]
        ); // taker fee amount; calculated relative to taker fill amount

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
        assetProxy_ = IZeroExV2(_targetExchange).getAssetProxy(assetProxyId);
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

    function validateTakeOrderParams(
        address[8] memory _orderAddresses,
        uint256[8] memory _orderValues,
        bytes[4] memory _orderData
    )
        internal
        view
    {
        require(
            getAssetAddress(_orderData[0]) == _orderAddresses[2],
            "validateTakeOrderParams: makerAssetData does not match address"
        );
        require(
            getAssetAddress(_orderData[1]) == _orderAddresses[3],
            "validateTakeOrderParams: takerAssetData does not match address"
        );
        require(
            calculateExpectedFillAmount(
                _orderValues[1],
                _orderValues[0],
                _orderValues[6]
            ) <= _orderValues[0],
            "validateTakeOrderParams: Maker fill amount greater than max order quantity"
        );
    }
}
