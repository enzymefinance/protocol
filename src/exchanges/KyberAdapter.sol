pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "./ExchangeAdapter.sol";
import "./interfaces/IKyberNetworkProxy.sol";
import "./OrderFiller.sol";
import "../dependencies/WETH.sol";

/// @title KyberAdapter Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Adapter between Melon and Kyber Network
contract KyberAdapter is ExchangeAdapter, OrderFiller {
    /// @notice Take a market order on Kyber Swap
    /// @param _targetExchange Address of the exchange
    /// @param _orderAddresses [2] Maker asset
    /// @param _orderAddresses [3] Taker asset
    /// @param _orderValues [0] Maker asset quantity
    /// @param _orderValues [1] Taker asset quantity
    /// @param _orderValues [6] Taker asset fill quantity
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
        __validateTakeOrderParams(_orderValues);

        (
            address[] memory fillAssets,
            uint256[] memory fillExpectedAmounts
        ) = __formatFillTakeOrderArgs(_orderAddresses, _orderValues);

        __fillTakeOrder(_targetExchange, fillAssets, fillExpectedAmounts);
    }

    // INTERNAL FUNCTIONS

    // Minimum acceptable rate of taker asset per maker asset
    function __calcMinMakerAssetPerTakerAssetRate(
        address[] memory _fillAssets,
        uint256[] memory _fillExpectedAmounts
    )
        internal
        view
        returns (uint)
    {
        return mul(
            _fillExpectedAmounts[1],
            10 ** uint256(ERC20WithFields(_fillAssets[1]).decimals())
        ) / _fillExpectedAmounts[0];
    }

    function __fillTakeOrder(
        address _targetExchange,
        address[] memory _fillAssets,
        uint256[] memory _fillExpectedAmounts
    )
        internal
        validateAndFinalizeFilledOrder(
            _targetExchange,
            _fillAssets,
            _fillExpectedAmounts
        )
    {
        address nativeAsset = __getNativeAssetAddress();

        // Execute order on exchange, depending on asset types
        if (_fillAssets[1] == nativeAsset) {
            __swapNativeAssetToToken(
                _targetExchange,
                _fillAssets,
                _fillExpectedAmounts
            );
        }
        else if (_fillAssets[0] == nativeAsset) {
            __swapTokenToNativeAsset(
                _targetExchange,
                _fillAssets,
                _fillExpectedAmounts
            );
        }
        else {
            __swapTokenToToken(
                _targetExchange,
                _fillAssets,
                _fillExpectedAmounts
            );
        }
    }

    function __formatFillTakeOrderArgs(
        address[8] memory _orderAddresses,
        uint256[8] memory _orderValues
    )
        internal
        pure
        returns (address[] memory, uint256[] memory)
    {
        address[] memory fillAssets = new address[](2);
        fillAssets[0] = _orderAddresses[2]; // maker asset
        fillAssets[1] = _orderAddresses[3]; // taker asset

        uint256[] memory fillExpectedAmounts = new uint256[](2);
        fillExpectedAmounts[0] = _orderValues[0]; // maker fill amount
        fillExpectedAmounts[1] = _orderValues[1]; // taker fill amount

        return (fillAssets, fillExpectedAmounts);
    }

    function __swapNativeAssetToToken(
        address _targetExchange,
        address[] memory _fillAssets,
        uint256[] memory _fillExpectedAmounts
    )
        internal
    {
        require(
            __getAccounting().assetBalances(_fillAssets[1]) >= _fillExpectedAmounts[1],
            "__swapNativeAssetToToken: insufficient native token assetBalance"
        );

        // Convert WETH to ETH
        WETH(payable(_fillAssets[1])).withdraw(_fillExpectedAmounts[1]);

        // Swap tokens
        IKyberNetworkProxy(_targetExchange).swapEtherToToken.value(
            _fillExpectedAmounts[1]
        )
        (
            _fillAssets[0],
            __calcMinMakerAssetPerTakerAssetRate(_fillAssets, _fillExpectedAmounts)
        );
    }

    function __swapTokenToNativeAsset(
        address _targetExchange,
        address[] memory _fillAssets,
        uint256[] memory _fillExpectedAmounts
    )
        internal
    {
        __approveAsset(_fillAssets[1], _targetExchange, _fillExpectedAmounts[1], "takerAsset");

        uint256 preEthBalance = payable(address(this)).balance;
        IKyberNetworkProxy(_targetExchange).swapTokenToEther(
            _fillAssets[1],
            _fillExpectedAmounts[1],
            __calcMinMakerAssetPerTakerAssetRate(_fillAssets, _fillExpectedAmounts)
        );
        uint256 ethFilledAmount = sub(payable(address(this)).balance, preEthBalance);

        // Convert ETH to WETH
        WETH(payable(_fillAssets[0])).deposit.value(ethFilledAmount)();
    }

    function __swapTokenToToken(
        address _targetExchange,
        address[] memory _fillAssets,
        uint256[] memory _fillExpectedAmounts
    )
        internal
    {
        __approveAsset(_fillAssets[1], _targetExchange, _fillExpectedAmounts[1], "takerAsset");

        IKyberNetworkProxy(_targetExchange).__swapTokenToToken(
            _fillAssets[1],
            _fillExpectedAmounts[1],
            _fillAssets[0],
            __calcMinMakerAssetPerTakerAssetRate(_fillAssets, _fillExpectedAmounts)
        );
    }

    function __validateTakeOrderParams(
        uint256[8] memory _orderValues
    )
        internal
        pure
    {
        require(
            _orderValues[1] == _orderValues[6],
            "__validateTakeOrderParams: fill taker quantity must equal taker quantity"
        );
    }
}
