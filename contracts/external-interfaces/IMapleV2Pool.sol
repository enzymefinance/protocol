// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/
import "./IERC4626.sol";

pragma solidity >=0.6.0 <0.9.0;

/// @title IMapleV2Pool Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IMapleV2Pool is IERC4626 {
    function convertToExitAssets(uint256 _shares) external view returns (uint256 assets_);

    function removeShares(uint256 _shares, address _owner) external;

    function requestRedeem(uint256 _shares, address _owner) external;

    function manager() external view returns (address poolManager_);
}
