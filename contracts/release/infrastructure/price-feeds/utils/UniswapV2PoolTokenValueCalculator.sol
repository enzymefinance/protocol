// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../../interfaces/IUniswapV2Factory.sol";
import "../../../interfaces/IUniswapV2Pair.sol";

/// @title UniswapV2PoolTokenValueCalculator Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Abstract contract for computing the value of Uniswap liquidity pool tokens
/// @dev Unless otherwise noted, these functions are adapted to our needs and style guide from
/// an un-merged Uniswap branch:
/// https://github.com/Uniswap/uniswap-v2-periphery/blob/267ba44471f3357071a2fe2573fe4da42d5ad969/contracts/libraries/UniswapV2LiquidityMathLibrary.sol
abstract contract UniswapV2PoolTokenValueCalculator {
    using SafeMath for uint256;

    uint256 private constant POOL_TOKEN_UNIT = 10**18;

    // INTERNAL FUNCTIONS

    /// @dev Given a Uniswap pool with token0 and token1 and their trusted rate,
    /// returns the value of one pool token unit in terms of token0 and token1.
    /// This is the only function used outside of this contract.
    function __calcTrustedPoolTokenValue(
        address _factory,
        address _pair,
        uint256 _token0TrustedRateAmount,
        uint256 _token1TrustedRateAmount
    ) internal view returns (uint256 token0Amount_, uint256 token1Amount_) {
        (uint256 reserve0, uint256 reserve1) = __calcReservesAfterArbitrage(
            _pair,
            _token0TrustedRateAmount,
            _token1TrustedRateAmount
        );

        return __calcPoolTokenValue(_factory, _pair, reserve0, reserve1);
    }

    // PRIVATE FUNCTIONS

    /// @dev Computes liquidity value given all the parameters of the pair
    function __calcPoolTokenValue(
        address _factory,
        address _pair,
        uint256 _reserve0,
        uint256 _reserve1
    ) private view returns (uint256 token0Amount_, uint256 token1Amount_) {
        IUniswapV2Pair pairContract = IUniswapV2Pair(_pair);
        uint256 totalSupply = pairContract.totalSupply();

        if (IUniswapV2Factory(_factory).feeTo() != address(0)) {
            uint256 kLast = pairContract.kLast();
            if (kLast > 0) {
                uint256 rootK = __uniswapSqrt(_reserve0.mul(_reserve1));
                uint256 rootKLast = __uniswapSqrt(kLast);
                if (rootK > rootKLast) {
                    uint256 numerator = totalSupply.mul(rootK.sub(rootKLast));
                    uint256 denominator = rootK.mul(5).add(rootKLast);
                    uint256 feeLiquidity = numerator.div(denominator);
                    totalSupply = totalSupply.add(feeLiquidity);
                }
            }
        }
        return (
            _reserve0.mul(POOL_TOKEN_UNIT).div(totalSupply),
            _reserve1.mul(POOL_TOKEN_UNIT).div(totalSupply)
        );
    }

    /// @dev Calculates the direction and magnitude of the profit-maximizing trade
    function __calcProfitMaximizingTrade(
        uint256 _token0TrustedRateAmount,
        uint256 _token1TrustedRateAmount,
        uint256 _reserve0,
        uint256 _reserve1
    ) private pure returns (bool token0ToToken1_, uint256 amountIn_) {
        token0ToToken1_ =
            _reserve0.mul(_token1TrustedRateAmount).div(_reserve1) < _token0TrustedRateAmount;

        uint256 leftSide;
        uint256 rightSide;
        if (token0ToToken1_) {
            leftSide = __uniswapSqrt(
                _reserve0.mul(_reserve1).mul(_token0TrustedRateAmount).mul(1000).div(
                    _token1TrustedRateAmount.mul(997)
                )
            );
            rightSide = _reserve0.mul(1000).div(997);
        } else {
            leftSide = __uniswapSqrt(
                _reserve0.mul(_reserve1).mul(_token1TrustedRateAmount).mul(1000).div(
                    _token0TrustedRateAmount.mul(997)
                )
            );
            rightSide = _reserve1.mul(1000).div(997);
        }

        if (leftSide < rightSide) {
            return (false, 0);
        }

        // Calculate the amount that must be sent to move the price to the profit-maximizing price
        amountIn_ = leftSide.sub(rightSide);

        return (token0ToToken1_, amountIn_);
    }

    /// @dev Calculates the pool reserves after an arbitrage moves the price to
    /// the profit-maximizing rate, given an externally-observed trusted rate
    /// between the two pooled assets
    function __calcReservesAfterArbitrage(
        address _pair,
        uint256 _token0TrustedRateAmount,
        uint256 _token1TrustedRateAmount
    ) private view returns (uint256 reserve0_, uint256 reserve1_) {
        (reserve0_, reserve1_, ) = IUniswapV2Pair(_pair).getReserves();

        // Skip checking whether the reserve is 0, as this is extremely unlikely given how
        // initial pool liquidity is locked, and since we maintain a list of registered pool tokens

        // Calculate how much to swap to arb to the trusted price
        (bool token0ToToken1, uint256 amountIn) = __calcProfitMaximizingTrade(
            _token0TrustedRateAmount,
            _token1TrustedRateAmount,
            reserve0_,
            reserve1_
        );
        if (amountIn == 0) {
            return (reserve0_, reserve1_);
        }

        // Adjust the reserves to account for the arb trade to the trusted price
        if (token0ToToken1) {
            uint256 amountOut = __uniswapV2GetAmountOut(amountIn, reserve0_, reserve1_);
            reserve0_ = reserve0_.add(amountIn);
            reserve1_ = reserve1_.sub(amountOut);
        } else {
            uint256 amountOut = __uniswapV2GetAmountOut(amountIn, reserve1_, reserve0_);
            reserve1_ = reserve1_.add(amountIn);
            reserve0_ = reserve0_.sub(amountOut);
        }

        return (reserve0_, reserve1_);
    }

    /// @dev Uniswap square root function. See:
    /// https://github.com/Uniswap/uniswap-lib/blob/6ddfedd5716ba85b905bf34d7f1f3c659101a1bc/contracts/libraries/Babylonian.sol
    function __uniswapSqrt(uint256 _y) private pure returns (uint256 z_) {
        if (_y > 3) {
            z_ = _y;
            uint256 x = _y / 2 + 1;
            while (x < z_) {
                z_ = x;
                x = (_y / x + x) / 2;
            }
        } else if (_y != 0) {
            z_ = 1;
        }
        // else z_ = 0

        return z_;
    }

    /// @dev Simplified version of UniswapV2Library's getAmountOut() function. See:
    /// https://github.com/Uniswap/uniswap-v2-periphery/blob/87edfdcaf49ccc52591502993db4c8c08ea9eec0/contracts/libraries/UniswapV2Library.sol#L42-L50
    function __uniswapV2GetAmountOut(
        uint256 _amountIn,
        uint256 _reserveIn,
        uint256 _reserveOut
    ) private pure returns (uint256 amountOut_) {
        uint256 amountInWithFee = _amountIn.mul(997);
        uint256 numerator = amountInWithFee.mul(_reserveOut);
        uint256 denominator = _reserveIn.mul(1000).add(amountInWithFee);

        return numerator.div(denominator);
    }
}
