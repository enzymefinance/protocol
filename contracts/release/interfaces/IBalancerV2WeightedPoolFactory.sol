// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title IBalancerV2WeightedPoolFactory interface
/// @author Enzyme Council <security@enzyme.finance>
interface IBalancerV2WeightedPoolFactory {
    function isPoolFromFactory(address _pool) external view returns (bool success_);
}
