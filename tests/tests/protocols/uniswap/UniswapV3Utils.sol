// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {Address} from "openzeppelin-solc-0.8/utils/Address.sol";
import {IUniswapV3Pool} from "uniswap-v3-core-0.8/contracts/interfaces/IUniswapV3Pool.sol";
import {FullMath} from "uniswap-v3-core-0.8/contracts/libraries/FullMath.sol";
import {TickMath} from "uniswap-v3-core-0.8/contracts/libraries/TickMath.sol";

import {AddOnUtilsBase} from "tests/utils/bases/AddOnUtilsBase.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IUniswapV3SwapRouter} from "tests/interfaces/external/IUniswapV3SwapRouter.sol";

address constant ETHEREUM_FACTORY_ADDRESS = 0x1F98431c8aD98523631AE4a59f267346ea31F984;
address constant ETHEREUM_NON_FUNGIBLE_TOKEN_MANAGER = 0xC36442b4a4522E871399CD717aBDD847Ab11FE88;
address constant ETHEREUM_SWAP_ROUTER = 0xE592427A0AEce92De3Edee1F18E0157C05861564;

address constant POLYGON_FACTORY_ADDRESS = ETHEREUM_FACTORY_ADDRESS;
address constant POLYGON_NON_FUNGIBLE_TOKEN_MANAGER = ETHEREUM_NON_FUNGIBLE_TOKEN_MANAGER;
address constant POLYGON_SWAP_ROUTER = ETHEREUM_SWAP_ROUTER;

address constant ARBITRUM_FACTORY_ADDRESS = ETHEREUM_FACTORY_ADDRESS;
address constant ARBITRUM_NON_FUNGIBLE_TOKEN_MANAGER = ETHEREUM_NON_FUNGIBLE_TOKEN_MANAGER;
address constant ARBITRUM_SWAP_ROUTER = ETHEREUM_SWAP_ROUTER;

abstract contract UniswapV3Utils is AddOnUtilsBase {
    using Address for address;

    function formatUniswapV3ExactInputData(
        address _recipient,
        address[] memory _pathAddresses,
        uint24[] memory _pathFees,
        uint256 _outgoingAssetAmount,
        uint256 _minIncomingAssetAmount
    ) internal view returns (bytes memory exactInputData_) {
        require(_pathAddresses.length > 1, "formatUniswapV3ExactInputSwapData: Not enough _pathAddresses");
        require(
            _pathFees.length == _pathAddresses.length - 1,
            "formatUniswapV3ExactInputSwapData: Incorrect _pathFees count"
        );

        bytes memory encodedPath;
        for (uint256 i; i < _pathAddresses.length; i++) {
            if (i != _pathAddresses.length - 1) {
                encodedPath = abi.encodePacked(encodedPath, _pathAddresses[i], _pathFees[i]);
            } else {
                encodedPath = abi.encodePacked(encodedPath, _pathAddresses[i]);
            }
        }

        IUniswapV3SwapRouter.ExactInputParams memory exactInputParams = IUniswapV3SwapRouter.ExactInputParams({
            path: encodedPath,
            recipient: _recipient,
            deadline: block.timestamp + 1,
            amountIn: _outgoingAssetAmount,
            amountOutMinimum: _minIncomingAssetAmount
        });

        return abi.encodeWithSelector(IUniswapV3SwapRouter.exactInput.selector, exactInputParams);
    }

    function uniswapV3CalcPoolPrice(address _poolAddress) internal view returns (uint256 token1AmountForToken0Unit_) {
        IUniswapV3Pool pool = IUniswapV3Pool(_poolAddress);
        (, int24 tickCurrent,,,,,) = pool.slot0();

        address baseToken = pool.token0();
        address quoteToken = pool.token1();
        uint128 baseAmount = uint128(assetUnit(IERC20(baseToken)));

        return __uniswapV3GetQuoteAtTick({
            tick: tickCurrent,
            baseAmount: baseAmount,
            baseToken: baseToken,
            quoteToken: quoteToken
        });
    }

    function uniswapV3DoNRoundTripSwaps(IUniswapV3Pool _pool, uint256 _nSwaps) internal {
        uint256 tradeSizeAsTokenBalanceBps = BPS_ONE_PERCENT / 10; // 0.1%; could parameterize

        IERC20 token0 = IERC20(_pool.token0());
        IERC20 token1 = IERC20(_pool.token1());
        uint24 poolFee = _pool.fee();

        // Swap within a reasonably small range
        uint256 token0TradeSize;
        uint256 token1TradeSize;
        {
            uint256 token0Balance = token0.balanceOf(address(_pool));
            uint256 token1Balance = token1.balanceOf(address(_pool));
            token0TradeSize = token0Balance * tradeSizeAsTokenBalanceBps / BPS_ONE_HUNDRED_PERCENT;
            token1TradeSize = token1Balance * tradeSizeAsTokenBalanceBps / BPS_ONE_HUNDRED_PERCENT;
        }

        while (_nSwaps > 0) {
            // roughly round-trip by swapping in each direction (will be off by fees)
            uniswapV3SimpleTradeRandomCaller({
                _outgoingAsset: token0,
                _outgoingAssetAmount: token0TradeSize,
                _incomingAsset: token1,
                _poolFee: poolFee
            });
            uniswapV3SimpleTradeRandomCaller({
                _outgoingAsset: token1,
                _outgoingAssetAmount: token1TradeSize,
                _incomingAsset: token0,
                _poolFee: poolFee
            });

            _nSwaps--;
        }
    }

    function uniswapV3SimpleTradeRandomCaller(
        IERC20 _outgoingAsset,
        uint256 _outgoingAssetAmount,
        IERC20 _incomingAsset,
        uint24 _poolFee
    ) internal {
        address swapRouterAddress;
        if (block.chainid == ETHEREUM_CHAIN_ID) {
            swapRouterAddress = ETHEREUM_SWAP_ROUTER;
        } else if (block.chainid == POLYGON_CHAIN_ID) {
            swapRouterAddress = POLYGON_SWAP_ROUTER;
        } else if (block.chainid == ARBITRUM_CHAIN_ID) {
            swapRouterAddress = ARBITRUM_SWAP_ROUTER;
        } else {
            revert("uniswapV3SimpleTradeRandomCaller: Invalid chainId");
        }

        uint24[] memory pathFees = new uint24[](1);
        pathFees[0] = _poolFee;

        bytes memory exactInputData = formatUniswapV3ExactInputData({
            _recipient: address(this),
            _pathAddresses: toArray(address(_outgoingAsset), address(_incomingAsset)),
            _pathFees: pathFees,
            _outgoingAssetAmount: _outgoingAssetAmount,
            _minIncomingAssetAmount: 0
        });

        // Define and seed random trader address with enough for the trade
        address trader = makeAddr("uniswapV3SimpleTradeRandomCaller: Trader");
        increaseTokenBalance({_token: _outgoingAsset, _to: trader, _amount: _outgoingAssetAmount});

        vm.startPrank(trader);
        _outgoingAsset.approve(swapRouterAddress, _outgoingAssetAmount);
        swapRouterAddress.functionCall(exactInputData);
        vm.stopPrank();
    }

    // Copied from OracleLibrary to resolve imports error
    // https://github.com/Uniswap/v3-periphery/blob/main/contracts/libraries/OracleLibrary.sol
    function __uniswapV3GetQuoteAtTick(int24 tick, uint128 baseAmount, address baseToken, address quoteToken)
        private
        pure
        returns (uint256 quoteAmount)
    {
        uint160 sqrtRatioX96 = TickMath.getSqrtRatioAtTick(tick);

        // Calculate quoteAmount with better precision if it doesn't overflow when multiplied by itself
        if (sqrtRatioX96 <= type(uint128).max) {
            uint256 ratioX192 = uint256(sqrtRatioX96) * sqrtRatioX96;
            quoteAmount = baseToken < quoteToken
                ? FullMath.mulDiv(ratioX192, baseAmount, 1 << 192)
                : FullMath.mulDiv(1 << 192, baseAmount, ratioX192);
        } else {
            uint256 ratioX128 = FullMath.mulDiv(sqrtRatioX96, sqrtRatioX96, 1 << 64);
            quoteAmount = baseToken < quoteToken
                ? FullMath.mulDiv(ratioX128, baseAmount, 1 << 128)
                : FullMath.mulDiv(1 << 128, baseAmount, ratioX128);
        }
    }
}
