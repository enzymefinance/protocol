// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title IMapleV2PoolManager Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IMapleV2PoolManager {
    function factory() external view returns (address factory_);

    function pool() external view returns (address pool_);

    function withdrawalManager() external view returns (address withdrawalManager_);
}
