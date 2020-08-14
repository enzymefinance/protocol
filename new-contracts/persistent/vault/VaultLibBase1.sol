// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "./VaultLibBaseCore.sol";

/// @title VaultLibBase1 Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice A persistent contract containing all required storage variables,
/// the constructor function, and setters used in deployment to a VaultLib.
/// @dev DO NOT EDIT CONTRACT.
/// If we need a new base with additional storage vars, inherit this contract in VaultLibBase2.
abstract contract VaultLibBase1 is VaultLibBaseCore {
    event AssetWithdrawn(address indexed asset, address indexed target, uint256 amount);
    event TrackedAssetAdded(address asset);
    event TrackedAssetRemoved(address asset);

    address[] internal trackedAssets;
    mapping(address => bool) internal assetToIsTracked;
}
