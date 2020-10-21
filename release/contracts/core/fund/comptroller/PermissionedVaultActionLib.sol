// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../vault/IVault.sol";
import "./ComptrollerStorage.sol";
import "./IPermissionedVaultActionLib.sol";

/// @title PermissionedVaultActionLib Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice A library for permissioned vault actions
/// @dev Always delegate-called by a ComptrollerProxy.
contract PermissionedVaultActionLib is ComptrollerStorage, IPermissionedVaultActionLib {
    address private immutable FEE_MANAGER;
    address private immutable INTEGRATION_MANAGER;

    modifier onlyPermissionedAction(IVault.VaultAction _action) {
        require(permissionedVaultActionAllowed, "onlyPermissionedAction: No action allowed");

        bool isValidAction;
        if (msg.sender == INTEGRATION_MANAGER) {
            require(
                _action == IVault.VaultAction.ApproveAssetSpender ||
                    _action == IVault.VaultAction.AddTrackedAsset ||
                    _action == IVault.VaultAction.RemoveTrackedAsset,
                "onlyPermissionedAction: Not valid for IntegrationManager"
            );
        } else if (msg.sender == FEE_MANAGER) {
            require(
                _action == IVault.VaultAction.BurnShares ||
                    _action == IVault.VaultAction.MintShares ||
                    _action == IVault.VaultAction.TransferShares,
                "onlyPermissionedAction: Not valid for FeeManager"
            );
        } else {
            revert("onlyPermissionedAction: Not a valid actor");
        }

        _;
    }

    constructor(address _feeManager, address _integrationManager) public {
        FEE_MANAGER = _feeManager;
        INTEGRATION_MANAGER = _integrationManager;
    }

    /// @notice Dispatches an action to be called on the vault
    /// @param _action The enum VaultAction for the action to perform
    /// @param _actionData The encoded data for the action
    function dispatchAction(IVault.VaultAction _action, bytes calldata _actionData)
        external
        override
        onlyPermissionedAction(_action)
    {
        if (_action == IVault.VaultAction.AddTrackedAsset) {
            __addTrackedAsset(_actionData);
        } else if (_action == IVault.VaultAction.ApproveAssetSpender) {
            __approveAssetSpender(_actionData);
        } else if (_action == IVault.VaultAction.BurnShares) {
            __burnShares(_actionData);
        } else if (_action == IVault.VaultAction.MintShares) {
            __mintShares(_actionData);
        } else if (_action == IVault.VaultAction.RemoveTrackedAsset) {
            __removeTrackedAsset(_actionData);
        } else if (_action == IVault.VaultAction.TransferShares) {
            __transferShares(_actionData);
        }
    }

    /// @notice Adds a tracked asset to the fund
    /// @param _actionData The encoded data for the action
    function __addTrackedAsset(bytes memory _actionData) private {
        address asset = abi.decode(_actionData, (address));
        IVault(vaultProxy).addTrackedAsset(asset);
    }

    /// @notice Grants an allowance to a spender to use a fund's asset
    /// @param _actionData The encoded data for the action
    function __approveAssetSpender(bytes memory _actionData) private {
        (address asset, address target, uint256 amount) = abi.decode(
            _actionData,
            (address, address, uint256)
        );
        IVault(vaultProxy).approveAssetSpender(asset, target, amount);
    }

    /// @notice Burns fund shares for a particular account
    /// @param _actionData The encoded data for the action
    function __burnShares(bytes memory _actionData) private {
        (address target, uint256 amount) = abi.decode(_actionData, (address, uint256));
        IVault(vaultProxy).burnShares(target, amount);
    }

    /// @notice Mints fund shares to a particular account
    /// @param _actionData The encoded data for the action
    function __mintShares(bytes memory _actionData) private {
        (address target, uint256 amount) = abi.decode(_actionData, (address, uint256));
        IVault(vaultProxy).mintShares(target, amount);
    }

    /// @notice Removes a tracked asset from the fund
    /// @param _actionData The encoded data for the action
    function __removeTrackedAsset(bytes memory _actionData) private {
        address asset = abi.decode(_actionData, (address));
        IVault(vaultProxy).removeTrackedAsset(asset);
    }

    /// @notice Transfers fund shares from one account to another
    // /// @param _target The account to which to mint shares
    // /// @param _amount The amount of shares to mint
    function __transferShares(bytes memory _actionData) private {
        (address from, address to, uint256 amount) = abi.decode(
            _actionData,
            (address, address, uint256)
        );
        IVault(vaultProxy).transferShares(from, to, amount);
    }
}
