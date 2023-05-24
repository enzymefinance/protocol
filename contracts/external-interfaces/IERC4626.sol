// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

import "openzeppelin-solc-0.6/token/ERC20/IERC20.sol";

/// @title IERC4626 Interface
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Minimal interface for interactions with IERC4626 tokens
interface IERC4626 is IERC20 {
    function asset() external view returns (address asset_);

    function deposit(uint256 _assets, address _receiver) external returns (uint256 shares_);

    function mint(uint256 shares_, address _receiver) external returns (uint256 assets_);

    function redeem(uint256 _shares, address _receiver, address _owner) external returns (uint256 assets_);

    function withdraw(uint256 _assets, address _receiver, address _owner) external returns (uint256 shares_);

    function convertToAssets(uint256 _shares) external view returns (uint256 assets_);

    function convertToShares(uint256 _assets) external view returns (uint256 shares_);

    function maxDeposit(address _receiver) external view returns (uint256 assets_);

    function maxMint(address _receiver) external view returns (uint256 shares_);

    function maxRedeem(address _owner) external view returns (uint256 shares_);

    function maxWithdraw(address _owner) external view returns (uint256 _assets);

    function previewDeposit(uint256 _assets) external view returns (uint256 shares_);

    function previewMint(uint256 _shares) external view returns (uint256 assets_);

    function previewRedeem(uint256 _shares) external view returns (uint256 assets_);

    function previewWithdraw(uint256 _assets) external view returns (uint256 shares_);

    function totalAssets() external view returns (uint256 totalAssets_);
}
