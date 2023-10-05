// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import {ConvexCurveLpStakingWrapperPriceFeed} from "./ConvexCurveLpStakingWrapperPriceFeed.sol";

/// @title AuraBalancerV2LpStakingWrapperPriceFeed Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Price source oracle for wrapped Aura-staked Balancer pool tokens
contract AuraBalancerV2LpStakingWrapperPriceFeed is ConvexCurveLpStakingWrapperPriceFeed {
    constructor(address _wrapperFactory) public ConvexCurveLpStakingWrapperPriceFeed(_wrapperFactory) {}
}
