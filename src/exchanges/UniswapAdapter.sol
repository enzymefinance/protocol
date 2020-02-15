pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "./ExchangeAdapter.sol";
import "./OrderFiller.sol";
import "../dependencies/WETH.sol";
import "./interfaces/IUniswapFactory.sol";
import "./interfaces/IUniswapExchange.sol";

contract UniswapAdapter is DSMath, ExchangeAdapter, OrderFiller {
    /// @notice Take a market order on Uniswap
    /// @param _targetExchange Address of Uniswap factory contract
    /// @param _orderAddresses [2] Maker asset
    /// @param _orderAddresses [3] Taker asset
    /// @param _orderValues [0] Maker asset quantity
    /// @param _orderValues [1] Taker asset quantity
    /// @param _orderValues [6] Taker asset fill amount
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
        require(
            _orderValues[1] == _orderValues[6],
            "taker order amount must equal taker fill amount"
        );

        (
            address[] memory fillAssets,
            uint256[] memory fillExpectedAmounts
        ) = formatFillTakeOrderArgs(_orderAddresses, _orderValues);

        fillTakeOrder(_targetExchange, fillAssets, fillExpectedAmounts);
    }

    // INTERNAL FUNCTIONS

    function fillTakeOrder(
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
        address nativeAsset = getAccounting().NATIVE_ASSET();

        if (_fillAssets[1] == nativeAsset) {
            swapNativeAssetToToken(
                _targetExchange,
                _fillAssets,
                _fillExpectedAmounts
            );
        }
        else if (_fillAssets[0] == nativeAsset) {
            swapTokenToNativeAsset(
                _targetExchange,
                _fillAssets,
                _fillExpectedAmounts
            );
        }
        else {
            swapTokenToToken(
                _targetExchange,
                _fillAssets,
                _fillExpectedAmounts
            );
        }
    }

    function formatFillTakeOrderArgs(
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

    function swapNativeAssetToToken(
        address _targetExchange,
        address[] memory _fillAssets,
        uint256[] memory _fillExpectedAmounts
    )
        internal
    {
        require(
            getAccounting().assetBalances(_fillAssets[1]) >= _fillExpectedAmounts[1],
            "swapNativeAssetToToken: insufficient native token assetBalance"
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

    function swapTokenToNativeAsset(
        address _targetExchange,
        address[] memory _fillAssets,
        uint256[] memory _fillExpectedAmounts
    )
        internal
    {
        address tokenExchange = IUniswapFactory(_targetExchange).getExchange(_fillAssets[1]);
        approveAsset(_fillAssets[1], tokenExchange, _fillExpectedAmounts[1], "takerAsset");

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

    function swapTokenToToken(
        address _targetExchange,
        address[] memory _fillAssets,
        uint256[] memory _fillExpectedAmounts
    )
        internal
    {
        address tokenExchange = IUniswapFactory(_targetExchange).getExchange(_fillAssets[1]);
        approveAsset(_fillAssets[1], tokenExchange, _fillExpectedAmounts[1], "takerAsset");
        IUniswapExchange(tokenExchange).tokenToTokenSwapInput(
            _fillExpectedAmounts[1],
            _fillExpectedAmounts[0],
            1,
            add(block.timestamp, 1),
            _fillAssets[0]
        );
    }
}
