// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title IBalancerV2WeightedPool interface
/// @author Enzyme Council <security@enzyme.finance>
interface IBalancerV2WeightedPool {
    function getInvariant() external view returns (uint256 invariant_);

    function getNormalizedWeights() external view returns (uint256[] memory weights_);

    function getPoolId() external view returns (bytes32 poolId_);
}
