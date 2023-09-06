// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title IArrakisV2Helper Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IArrakisV2Helper {
    struct PositionLiquidity {
        uint128 liquidity;
        Range range;
    }

    struct Range {
        int24 lowerTick;
        int24 upperTick;
        uint24 feeTier;
    }

    function totalLiquidity(address _vault) external view returns (PositionLiquidity[] memory liquidities_);

    function totalUnderlying(address _vault) external view returns (uint256 amount0_, uint256 amount1_);
}
