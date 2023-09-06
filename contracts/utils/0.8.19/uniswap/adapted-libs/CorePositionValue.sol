// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.6.8 <0.9.0;

import {IUniswapV3Pool} from "uniswap-v3-core-0.8/contracts/interfaces/IUniswapV3Pool.sol";
import {FixedPoint128} from "uniswap-v3-core-0.8/contracts/libraries/FixedPoint128.sol";
import {FullMath} from "uniswap-v3-core-0.8/contracts/libraries/FullMath.sol";
import {TickMath} from "uniswap-v3-core-0.8/contracts/libraries/TickMath.sol";
import {PositionKey} from "uniswap-v3-periphery-0.8/libraries/PositionKey.sol";
import {LiquidityAmounts} from "./LiquidityAmounts.sol";

/// @title Returns information about the token value held in a Uniswap V3 liquidity position
/// @dev This is a direct copy of PositionValue is Uniswap's v3-periphery repo,
/// refactored to handle core liquidity positions instead of NFTs.
/// Source: https://github.com/Uniswap/v3-periphery/blob/b325bb0905d922ae61fcc7df85ee802e8df5e96c/contracts/libraries/PositionValue.sol
library CorePositionValue {
    /// @notice Returns the total amounts of token0 and token1, i.e. the sum of fees and principal
    /// that a given liquidity position is worth
    /// @param poolAddress The Uniswap V3 pool
    /// @param owner The owner of the liquidity position for which to get the total value
    /// @param tickLower The lower tick of the liquidity position for which to get the total value
    /// @param tickUpper The upper tick of the liquidity position for which to get the total value
    /// @param sqrtRatioX96 The square root price X96 for which to calculate the principal amounts
    /// @return amount0 The total amount of token0 including principal and fees
    /// @return amount1 The total amount of token1 including principal and fees
    function total(address poolAddress, address owner, int24 tickLower, int24 tickUpper, uint160 sqrtRatioX96)
        internal
        view
        returns (uint256 amount0, uint256 amount1)
    {
        (uint256 amount0Principal, uint256 amount1Principal) =
            principal(poolAddress, owner, tickLower, tickUpper, sqrtRatioX96);
        (uint256 amount0Fee, uint256 amount1Fee) = fees(poolAddress, owner, tickLower, tickUpper);
        return (amount0Principal + amount0Fee, amount1Principal + amount1Fee);
    }

    /// @notice Calculates the principal (currently acting as liquidity) owed to the position owner in the event
    /// that the position is burned
    /// @param poolAddress The Uniswap V3 pool
    /// @param owner The owner of the liquidity position for which to get the total principal owed
    /// @param tickLower The lower tick of the liquidity position for which to get the total principal owed
    /// @param tickUpper The upper tick of the liquidity position for which to get the total principal owed
    /// @param sqrtRatioX96 The square root price X96 for which to calculate the principal amounts
    /// @return amount0 The principal amount of token0
    /// @return amount1 The principal amount of token1
    function principal(address poolAddress, address owner, int24 tickLower, int24 tickUpper, uint160 sqrtRatioX96)
        internal
        view
        returns (uint256 amount0, uint256 amount1)
    {
        (uint128 liquidity,,,,) = IUniswapV3Pool(poolAddress).positions(
            PositionKey.compute({owner: owner, tickLower: tickLower, tickUpper: tickUpper})
        );

        return LiquidityAmounts.getAmountsForLiquidity(
            sqrtRatioX96, TickMath.getSqrtRatioAtTick(tickLower), TickMath.getSqrtRatioAtTick(tickUpper), liquidity
        );
    }

    struct FeeParams {
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        uint256 positionFeeGrowthInside0LastX128;
        uint256 positionFeeGrowthInside1LastX128;
        uint256 tokensOwed0;
        uint256 tokensOwed1;
    }

    /// @notice Calculates the total fees owed to the position owner
    /// @param poolAddress The Uniswap V3 pool
    /// @param owner The owner of the liquidity position for which to get the total fees owed
    /// @param tickLower The lower tick of the liquidity position for which to get the total fees owed
    /// @param tickUpper The upper tick of the liquidity position for which to get the total fees owed
    /// @return amount0 The amount of fees owed in token0
    /// @return amount1 The amount of fees owed in token1
    function fees(address poolAddress, address owner, int24 tickLower, int24 tickUpper)
        internal
        view
        returns (uint256 amount0, uint256 amount1)
    {
        (
            uint128 liquidity,
            uint256 positionFeeGrowthInside0LastX128,
            uint256 positionFeeGrowthInside1LastX128,
            uint128 tokensOwed0,
            uint128 tokensOwed1
        ) = IUniswapV3Pool(poolAddress).positions(
            PositionKey.compute({owner: owner, tickLower: tickLower, tickUpper: tickUpper})
        );

        return _fees(
            IUniswapV3Pool(poolAddress),
            FeeParams({
                tickLower: tickLower,
                tickUpper: tickUpper,
                liquidity: liquidity,
                positionFeeGrowthInside0LastX128: positionFeeGrowthInside0LastX128,
                positionFeeGrowthInside1LastX128: positionFeeGrowthInside1LastX128,
                tokensOwed0: tokensOwed0,
                tokensOwed1: tokensOwed1
            })
        );
    }

    function _fees(IUniswapV3Pool pool, FeeParams memory feeParams)
        private
        view
        returns (uint256 amount0, uint256 amount1)
    {
        (uint256 poolFeeGrowthInside0LastX128, uint256 poolFeeGrowthInside1LastX128) =
            _getFeeGrowthInside(pool, feeParams.tickLower, feeParams.tickUpper);

        amount0 = FullMath.mulDiv(
            poolFeeGrowthInside0LastX128 - feeParams.positionFeeGrowthInside0LastX128,
            feeParams.liquidity,
            FixedPoint128.Q128
        ) + feeParams.tokensOwed0;

        amount1 = FullMath.mulDiv(
            poolFeeGrowthInside1LastX128 - feeParams.positionFeeGrowthInside1LastX128,
            feeParams.liquidity,
            FixedPoint128.Q128
        ) + feeParams.tokensOwed1;
    }

    function _getFeeGrowthInside(IUniswapV3Pool pool, int24 tickLower, int24 tickUpper)
        private
        view
        returns (uint256 feeGrowthInside0X128, uint256 feeGrowthInside1X128)
    {
        (, int24 tickCurrent,,,,,) = pool.slot0();
        (,, uint256 lowerFeeGrowthOutside0X128, uint256 lowerFeeGrowthOutside1X128,,,,) = pool.ticks(tickLower);
        (,, uint256 upperFeeGrowthOutside0X128, uint256 upperFeeGrowthOutside1X128,,,,) = pool.ticks(tickUpper);

        if (tickCurrent < tickLower) {
            feeGrowthInside0X128 = lowerFeeGrowthOutside0X128 - upperFeeGrowthOutside0X128;
            feeGrowthInside1X128 = lowerFeeGrowthOutside1X128 - upperFeeGrowthOutside1X128;
        } else if (tickCurrent < tickUpper) {
            uint256 feeGrowthGlobal0X128 = pool.feeGrowthGlobal0X128();
            uint256 feeGrowthGlobal1X128 = pool.feeGrowthGlobal1X128();
            feeGrowthInside0X128 = feeGrowthGlobal0X128 - lowerFeeGrowthOutside0X128 - upperFeeGrowthOutside0X128;
            feeGrowthInside1X128 = feeGrowthGlobal1X128 - lowerFeeGrowthOutside1X128 - upperFeeGrowthOutside1X128;
        } else {
            feeGrowthInside0X128 = upperFeeGrowthOutside0X128 - lowerFeeGrowthOutside0X128;
            feeGrowthInside1X128 = upperFeeGrowthOutside1X128 - lowerFeeGrowthOutside1X128;
        }
    }
}
