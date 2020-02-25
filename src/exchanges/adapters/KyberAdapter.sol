pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "../interfaces/IKyberNetworkProxy.sol";
import "../libs/ExchangeAdapter.sol";
import "../libs/OrderTaker.sol";
import "../../dependencies/WETH.sol";

/// @title KyberAdapter Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Adapter between Melon and Kyber Network
contract KyberAdapter is ExchangeAdapter, OrderTaker {
    /// @notice Take a market order on Kyber Swap (takeOrder)
    /// @param _targetExchange Address of the Kyber exchange
    /// @param _orderAddresses [2] Maker asset
    /// @param _orderAddresses [3] Taker asset
    /// @param _orderValues [0] Maker asset quantity
    /// @param _orderValues [1] Taker asset quantity
    /// @param _orderValues [6] Taker asset fill quantity (same as _orderValues[1])
    /// @param _fillAssets [0] Maker asset (same as _orderAddresses[2])
    /// @param _fillAssets [1] Taker asset (same as _orderAddresses[3])
    /// @param _fillExpectedAmounts [0] Expected (min) quantity of maker asset to receive
    /// @param _fillExpectedAmounts [1] Expected (max) quantity of taker asset to spend
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

    /// @notice Formats arrays of _fillAssets and their _fillExpectedAmounts for a takeOrder call
    /// @param _targetExchange Address of the Kyber exchange
    /// @param _orderAddresses [2] Maker asset
    /// @param _orderAddresses [3] Taker asset
    /// @param _orderValues [0] Maker asset quantity
    /// @param _orderValues [1] Taker asset quantity
    /// @param _orderValues [6] Taker asset fill quantity
    /// @return _fillAssets Assets to fill
    /// - [0] Maker asset (same as _orderAddresses[2])
    /// - [1] Taker asset (same as _orderAddresses[3])
    /// @return _fillExpectedAmounts Asset fill amounts
    /// - [0] Expected (min) quantity of maker asset to receive
    /// - [1] Expected (max) quantity of taker asset to spend
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
        address[] memory fillAssets = new address[](2);
        fillAssets[0] = _orderAddresses[2]; // maker asset
        fillAssets[1] = _orderAddresses[3]; // taker asset

        uint256[] memory fillExpectedAmounts = new uint256[](2);
        fillExpectedAmounts[0] = _orderValues[0]; // maker fill amount
        fillExpectedAmounts[1] = _orderValues[1]; // taker fill amount

        return (fillAssets, fillExpectedAmounts);
    }

    /// @notice Validate the parameters of a takeOrder call
    /// @param _targetExchange Address of the Kyber exchange
    /// @param _orderAddresses [2] Maker asset
    /// @param _orderAddresses [3] Taker asset
    /// @param _orderValues [0] Maker asset quantity
    /// @param _orderValues [1] Taker asset quantity
    /// @param _orderValues [6] Taker asset fill quantity
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
            _orderValues[1] == _orderValues[6],
            "__validateTakeOrderParams: fill taker quantity must equal taker quantity"
        );
    }

    // PRIVATE FUNCTIONS

    /// @notice Calculates the minimum acceptable rate of taker asset per maker asset
    /// @dev Required by Kyber swap
    function __calcMinMakerAssetPerTakerAssetRate(
        address[] memory _fillAssets,
        uint256[] memory _fillExpectedAmounts
    )
        private
        view
        returns (uint256)
    {
        return mul(
            _fillExpectedAmounts[1],
            10 ** uint256(ERC20WithFields(_fillAssets[0]).decimals())
        ) / _fillExpectedAmounts[0];
    }

    /// @notice Executes a swap of ETH (taker) to ERC20 (maker)
    function __swapNativeAssetToToken(
        address _targetExchange,
        address[] memory _fillAssets,
        uint256[] memory _fillExpectedAmounts
    )
        private
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

    /// @notice Executes a swap of ERC20 (taker) to ETH (maker)
    function __swapTokenToNativeAsset(
        address _targetExchange,
        address[] memory _fillAssets,
        uint256[] memory _fillExpectedAmounts
    )
        private
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

    /// @notice Executes a swap of ERC20 (taker) to ERC20 (maker)
    function __swapTokenToToken(
        address _targetExchange,
        address[] memory _fillAssets,
        uint256[] memory _fillExpectedAmounts
    )
        private
    {
        __approveAsset(_fillAssets[1], _targetExchange, _fillExpectedAmounts[1], "takerAsset");

        IKyberNetworkProxy(_targetExchange).swapTokenToToken(
            _fillAssets[1],
            _fillExpectedAmounts[1],
            _fillAssets[0],
            __calcMinMakerAssetPerTakerAssetRate(_fillAssets, _fillExpectedAmounts)
        );
    }
}
