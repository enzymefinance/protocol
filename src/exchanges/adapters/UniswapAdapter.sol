pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "../libs/ExchangeAdapter.sol";
import "../libs/OrderFiller.sol";
import "../interfaces/IUniswapFactory.sol";
import "../interfaces/IUniswapExchange.sol";
import "../../dependencies/WETH.sol";

/// @title UniswapAdapter Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Adapter between Melon and Uniswap
contract UniswapAdapter is ExchangeAdapter, OrderFiller {
    /// @notice Take a market order on Uniswap
    /// @param _targetExchange Address of Uniswap factory contract
    /// @param _orderAddresses [2] Maker asset
    /// @param _orderAddresses [3] Taker asset
    /// @param _orderValues [0] Maker asset quantity
    /// @param _orderValues [1] Taker asset quantity
    /// @param _orderValues [6] Taker asset fill amount (same as _orderValues[1])
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
        address tokenExchange = IUniswapFactory(_targetExchange).getExchange(_fillAssets[0]);
        IUniswapExchange(tokenExchange).ethToTokenSwapInput.value(
            _fillExpectedAmounts[1]
        )
        (
            _fillExpectedAmounts[0],
            add(block.timestamp, 1)
        );
    }

    function __swapTokenToNativeAsset(
        address _targetExchange,
        address[] memory _fillAssets,
        uint256[] memory _fillExpectedAmounts
    )
        internal
    {
        address tokenExchange = IUniswapFactory(_targetExchange).getExchange(_fillAssets[1]);
        __approveAsset(_fillAssets[1], tokenExchange, _fillExpectedAmounts[1], "takerAsset");

        uint256 preEthBalance = payable(address(this)).balance;
        IUniswapExchange(tokenExchange).tokenToEthSwapInput(
            _fillExpectedAmounts[1],
            _fillExpectedAmounts[0],
            add(block.timestamp, 1)
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
        address tokenExchange = IUniswapFactory(_targetExchange).getExchange(_fillAssets[1]);
        __approveAsset(_fillAssets[1], tokenExchange, _fillExpectedAmounts[1], "takerAsset");
        IUniswapExchange(tokenExchange).tokenToTokenSwapInput(
            _fillExpectedAmounts[1],
            _fillExpectedAmounts[0],
            1,
            add(block.timestamp, 1),
            _fillAssets[0]
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
