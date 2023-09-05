// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

import {IStakingWrapper} from "../IStakingWrapper.sol";

/// @title IConvexCurveLpStakingWrapper Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IConvexCurveLpStakingWrapper is IStakingWrapper {
    function addExtraRewards() external;

    function getConvexPool() external view returns (address convexPool_);

    function getConvexPoolId() external view returns (uint256 convexPoolId_);

    function getCurveLpToken() external view returns (address curveLPToken_);

    function init(uint256 _pid) external;

    function setApprovals() external;
}
