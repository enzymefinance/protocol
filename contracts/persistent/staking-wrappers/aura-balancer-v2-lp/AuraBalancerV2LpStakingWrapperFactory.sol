// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {ConvexCurveLpStakingWrapperFactory} from "../convex-curve-lp/ConvexCurveLpStakingWrapperFactory.sol";

/// @title AuraBalancerV2LpStakingWrapperFactory Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A contract factory for Aura BalancerV2 staking wrapper instances
contract AuraBalancerV2LpStakingWrapperFactory is ConvexCurveLpStakingWrapperFactory {
    constructor(address _dispatcher, address _implementation)
        ConvexCurveLpStakingWrapperFactory(_dispatcher, _implementation)
    {}
}
