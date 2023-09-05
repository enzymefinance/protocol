// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {IAuraStashToken} from "../../../../external-interfaces/IAuraStashToken.sol";
import {ConvexCurveLpStakingWrapperLib} from "../convex-curve-lp/ConvexCurveLpStakingWrapperLib.sol";

/// @title AuraBalancerV2LpStakingWrapperLib Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A library contract for AuraBalancerV2LpStakingWrapper instances
contract AuraBalancerV2LpStakingWrapperLib is ConvexCurveLpStakingWrapperLib {
    constructor(address _owner, address _convexBooster, address _balToken, address _auraToken)
        ConvexCurveLpStakingWrapperLib(_owner, _convexBooster, _balToken, _auraToken)
    {}

    /// @dev Helper to get the pool id at which stash tokens are exclusively used for extra rewards.
    /// In Aura, this is the case for pools with pid >= 48.
    /// See: https://forum.aura.finance/t/aip-29-finish-migration-of-aura-pools-to-optimize-integrations-enact-aip-26
    function __stashTokenStartPid() internal pure override returns (uint256 startPid_) {
        return 48;
    }

    /// @dev Helper to get the selector for querying the underlying token of a stash token
    function __stashTokenUnderlyingSelector() internal pure override returns (bytes4 selector_) {
        return IAuraStashToken.baseToken.selector;
    }
}
