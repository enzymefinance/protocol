// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title CompoundDebtPositionLibBase1 Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A persistent contract containing all required storage variables and
/// required functions for a CompoundDebtPositionLib implementation
/// @dev DO NOT EDIT CONTRACT. If new events or storage are necessary, they should be added to
/// a numbered CompoundDebtPositionLibBaseXXX that inherits the previous base.
/// e.g., `CompoundDebtPositionLibBase2 is CompoundDebtPositionLibBase1`

contract CompoundDebtPositionLibBase1 {
    event AssetBorrowed(address indexed asset, uint256 amount);

    event BorrowedAssetRepaid(address indexed asset, uint256 amount);

    event CollateralAssetAdded(address indexed asset, uint256 amount);

    event CollateralAssetRemoved(address indexed asset, uint256 amount);

    address[] internal borrowedAssets;
    address[] internal collateralAssets;

    mapping(address => bool) internal assetToIsCollateral;
    mapping(address => address) internal borrowedAssetToCToken;
}
