// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "./ITestERC4626.sol";

/// @title ITestMapleV2Pool Interface
/// @author Enzyme Council <security@enzyme.finance>
interface ITestMapleV2Pool is ITestERC4626 {
    function convertToExitAssets(uint256 _shares) external view returns (uint256 assets_);

    function convertToExitShares(uint256 _assets) external view returns (uint256 shares_);

    function manager() external view returns (address poolManager_);
}
