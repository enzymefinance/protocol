// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title ITestMapleV2PoolManager Interface
/// @author Enzyme Council <security@enzyme.finance>
interface ITestMapleV2PoolManager {
    function factory() external view returns (address factory_);

    function pool() external view returns (address pool_);

    function poolDelegate() external view returns (address poolDelegate_);

    function setLiquidityCap(uint256 _liquidityCap) external;

    function totalAssets() external view returns (uint256 totalAssets_);

    function withdrawalManager() external view returns (address withdrawalManager_);
}
