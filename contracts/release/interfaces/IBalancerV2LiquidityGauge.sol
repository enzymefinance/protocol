// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title IBalancerV2LiquidityGauge interface
/// @author Enzyme Council <security@enzyme.finance>
/// @dev Applies to both LiquidityGauge (L1) and ChildChainLiquidityGauge (L2/sidechains)
interface IBalancerV2LiquidityGauge {
    function lp_token() external view returns (address lpToken_);
}
