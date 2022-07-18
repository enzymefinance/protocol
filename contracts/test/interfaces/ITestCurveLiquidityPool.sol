// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title ITestCurveLiquidityPool interface
/// @author Enzyme Council <security@enzyme.finance>
interface ITestCurveLiquidityPool {
    function coins(int128 _index) external view returns (address asset_);

    function coins(uint256 _index) external view returns (address asset_);

    function get_virtual_price() external view returns (uint256 price_);

    function underlying_coins(int128 _index) external view returns (address asset_);

    function underlying_coins(uint256 _index) external view returns (address asset_);
}
