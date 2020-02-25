pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "../interfaces/IZeroExV3.sol";
import "../libs/ExchangeAdapter.sol";
import "../libs/OrderFiller.sol";

/// @title ZeroExV3Adapter Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Adapter to 0xV3 Exchange Contract
contract ZeroExV3Adapter is ExchangeAdapter, OrderFiller {
    /// @notice Takes an active order on 0x v3
    /// @param _orderAddresses [0] Order param: makerAddress
    /// @param _orderAddresses [1] Order param: takerAddress
    /// @param _orderAddresses [2] Maker asset
    /// @param _orderAddresses [3] Taker asset
    /// @param _orderAddresses [4] Order param: feeRecipientAddress
    /// @param _orderAddresses [5] Order param: senderAddress
    /// @param _orderAddresses [6] Maker fee asset
    /// @param _orderAddresses [7] Taker fee asset
    /// @param _orderData [0] Order param: makerAssetData
    /// @param _orderData [1] Order param: takerAssetData
    /// @param _orderData [2] Order param: makerFeeAssetData
    /// @param _orderData [3] Order param: takerFeeAssetData
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
        uint256[8] memory _orderValues,
        bytes[4] memory _orderData,
        bytes32 _identifier,
        bytes memory _signature
    )
        public
        override
    {
        __validateTakeOrderParams(
            _targetExchange,
            _orderAddresses,
            _orderValues,
            _orderData,
            _identifier,
            _signature
        );

        (
            address[] memory fillAssets,
            uint256[] memory fillExpectedAmounts
        ) = __formatFillTakeOrderArgs(
            _targetExchange,
            _orderAddresses,
            _orderValues,
            _orderData,
            _identifier,
            _signature
        );

        __fillTakeOrder(
            _targetExchange,
            _orderAddresses,
            _orderValues,
            _orderData,
            _identifier,
            _signature,
            fillAssets,
            fillExpectedAmounts
        );
    }

    // INTERNAL FUNCTIONS

    function __fillTakeOrder(
        address _targetExchange,
        address[8] memory _orderAddresses,
        uint256[8] memory _orderValues,
        bytes[4] memory _orderData,
        bytes32 _identifier,
        bytes memory _signature,
        address[] memory _fillAssets,
        uint256[] memory _fillExpectedAmounts
    )
        internal
        override
        validateAndFinalizeFilledOrder(
            _targetExchange,
            _fillAssets,
            _fillExpectedAmounts
        )
    {
        IZeroExV3.Order memory order = __constructOrderStruct(
            _orderAddresses,
            _orderValues,
            _orderData
        );

        // Approve taker, taker fee, and protocol fee assets
        __approveAssetsTakeOrder(_targetExchange, order, _fillExpectedAmounts);

        // Execute take order on exchange
        IZeroExV3(_targetExchange).fillOrder(order, _fillExpectedAmounts[1], _signature);
    }

    function __formatFillTakeOrderArgs(
        address _targetExchange,
        address[8] memory _orderAddresses,
        uint256[8] memory _orderValues,
        bytes[4] memory _orderData,
        bytes32 _identifier,
        bytes memory _signature
    )
        internal
        view
        override
        returns (address[] memory, uint256[] memory)
    {
        address[] memory fillAssets = new address[](4);
        fillAssets[0] = _orderAddresses[2]; // maker asset
        fillAssets[1] = _orderAddresses[3]; // taker asset
        fillAssets[2] = __getNativeAssetAddress(); // protocol fee
        fillAssets[3] = _orderAddresses[7]; // taker fee asset

        uint256[] memory fillExpectedAmounts = new uint256[](4);
        fillExpectedAmounts[0] = __calculateExpectedFillAmount(
            _orderValues[1],
            _orderValues[0],
            _orderValues[6]
        ); // maker fill amount; calculated relative to taker fill amount
        fillExpectedAmounts[1] = _orderValues[6]; // taker fill amount
        fillExpectedAmounts[2] = __calcProtocolFeeAmount(_targetExchange); // protocol fee
        fillExpectedAmounts[3] = __calculateExpectedFillAmount(
            _orderValues[1],
            _orderValues[3],
            _orderValues[6]
        ); // taker fee amount; calculated relative to taker fill amount

        return (fillAssets, fillExpectedAmounts);
    }

    function __validateTakeOrderParams(
        address _targetExchange,
        address[8] memory _orderAddresses,
        uint256[8] memory _orderValues,
        bytes[4] memory _orderData,
        bytes32 _identifier,
        bytes memory _signature
    )
        internal
        view
        override
    {
        require(
            __getAssetAddress(_orderData[0]) == _orderAddresses[2],
            "__validateTakeOrderParams: makerAssetData does not match address"
        );
        require(
            __getAssetAddress(_orderData[1]) == _orderAddresses[3],
            "__validateTakeOrderParams: takerAssetData does not match address"
        );
        require(
            _orderValues[6] <= _orderValues[1],
            "__validateTakeOrderParams: taker fill amount greater than max order quantity"
        );
        if (_orderValues[3] > 0) {
            require(
                __getAssetAddress(_orderData[3]) == _orderAddresses[7],
                "__validateTakeOrderParams: takerFeeAssetData does not match address"
            );
        }
        require(
            IZeroExV3(_targetExchange).isValidOrderSignature(
                __constructOrderStruct(_orderAddresses, _orderValues, _orderData),
                _signature
            ),
            "__validateTakeOrderParams: order signature is invalid"
        );
    }

    // PRIVATE FUNCTIONS

    // Approves takerAsset, takerFeeAsset, protocolFee
    function __approveAssetsTakeOrder(
        address _targetExchange,
        IZeroExV3.Order memory _order,
        uint256[] memory _fillExpectedAmounts
    )
        private
    {
        __approveProtocolFeeAsset(_targetExchange);
        __approveAsset(
            __getAssetAddress(_order.takerAssetData),
            __getAssetProxy(_targetExchange, _order.takerAssetData),
            _fillExpectedAmounts[1],
            "takerAsset"
        );
        if (_order.takerFee > 0) {
            __approveAsset(
                __getAssetAddress(_order.takerFeeAssetData),
                __getAssetProxy(_targetExchange, _order.takerFeeAssetData),
                _fillExpectedAmounts[3],
                "takerFeeAsset"
            );
        }
    }

    function __approveProtocolFeeAsset(address _targetExchange) internal {
        address protocolFeeCollector = IZeroExV3(_targetExchange).protocolFeeCollector();
        uint256 protocolFeeAmount = __calcProtocolFeeAmount(_targetExchange);
        if (protocolFeeCollector == address(0) || protocolFeeAmount == 0) return;

        __approveAsset(
            __getNativeAssetAddress(),
            protocolFeeCollector,
            protocolFeeAmount,
            "protocolFee"
        );
    }

    function __calcProtocolFeeAmount(address _targetExchange) internal view returns (uint256) {
        return mul(IZeroExV3(_targetExchange).protocolFeeMultiplier(), tx.gasprice);
    }

    function __constructOrderStruct(
        address[8] memory _orderAddresses,
        uint256[8] memory _orderValues,
        bytes[4] memory _orderData
    )
        private
        pure
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

    function __getAssetProxy(address _targetExchange, bytes memory _assetData)
        private
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

    function __getAssetAddress(bytes memory _assetData)
        private
        pure
        returns (address assetAddress_)
    {
        assembly {
            assetAddress_ := mload(add(_assetData, 36))
        }
    }
}
