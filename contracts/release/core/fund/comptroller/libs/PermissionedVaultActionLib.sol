// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;

import "../../../fund-deployer/IFundDeployer.sol";
import "../../vault/IVault.sol";
import "../utils/ComptrollerStorage.sol";
import "./IPermissionedVaultActionLib.sol";

/// @title PermissionedVaultActionLib Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice A library for permissioned vault actions callable by Extensions
/// @dev Always delegate-called by a ComptrollerProxy
contract PermissionedVaultActionLib is ComptrollerStorage, IPermissionedVaultActionLib {
    address private immutable FEE_MANAGER;
    address private immutable FUND_DEPLOYER;
    address private immutable INTEGRATION_MANAGER;

    // The use of modifiers for one-time use is generally avoided, but makes it easier to
    // maintain visual symmetry across Comptroller libs

    modifier onlyActive() {
        require(vaultProxy != address(0), "Fund not active");
        _;
    }

    modifier onlyNotPaused() {
        require(
            IFundDeployer(FUND_DEPLOYER).getReleaseStatus() !=
                IFundDeployer.ReleaseStatus.Paused ||
                overridePause,
            "Fund is paused"
        );
        _;
    }

    constructor(
        address _fundDeployer,
        address _feeManager,
        address _integrationManager
    ) public {
        FEE_MANAGER = _feeManager;
        FUND_DEPLOYER = _fundDeployer;
        INTEGRATION_MANAGER = _integrationManager;
    }

    /// @notice Dispatches an action to be called on the vault
    /// @param _action The enum VaultAction for the action to perform
    /// @param _actionData The encoded data for the action
    function dispatchAction(VaultAction _action, bytes calldata _actionData)
        external
        override
        onlyNotPaused
        onlyActive
    {
        __assertPermissionedAction(msg.sender, _action);

        if (_action == VaultAction.AddTrackedAsset) {
            __addTrackedAsset(_actionData);
        } else if (_action == VaultAction.ApproveAssetSpender) {
            __approveAssetSpender(_actionData);
        } else if (_action == VaultAction.BurnShares) {
            __burnShares(_actionData);
        } else if (_action == VaultAction.MintShares) {
            __mintShares(_actionData);
        } else if (_action == VaultAction.RemoveTrackedAsset) {
            __removeTrackedAsset(_actionData);
        } else if (_action == VaultAction.TransferShares) {
            __transferShares(_actionData);
        } else if (_action == VaultAction.WithdrawAssetTo) {
            __withdrawAssetTo(_actionData);
        }
    }

    function __assertPermissionedAction(address _caller, VaultAction _action) private view {
        require(permissionedVaultActionAllowed, "__assertPermissionedAction: No action allowed");

        if (_caller == INTEGRATION_MANAGER) {
            require(
                _action == VaultAction.ApproveAssetSpender ||
                    _action == VaultAction.AddTrackedAsset ||
                    _action == VaultAction.RemoveTrackedAsset ||
                    _action == VaultAction.WithdrawAssetTo,
                "__assertPermissionedAction: Not valid for IntegrationManager"
            );
        } else if (_caller == FEE_MANAGER) {
            require(
                _action == VaultAction.BurnShares ||
                    _action == VaultAction.MintShares ||
                    _action == VaultAction.TransferShares,
                "__assertPermissionedAction: Not valid for FeeManager"
            );
        } else {
            revert("__assertPermissionedAction: Not a valid actor");
        }
    }

    //////////////////////////
    // PERMISSIONED ACTIONS //
    //////////////////////////

    /// @dev Helper to add a tracked asset to the fund
    function __addTrackedAsset(bytes memory _actionData) private {
        address asset = abi.decode(_actionData, (address));
        IVault(vaultProxy).addTrackedAsset(asset);
    }

    /// @dev Helper to grant a spender an allowance for a fund's asset
    function __approveAssetSpender(bytes memory _actionData) private {
        (address asset, address target, uint256 amount) = abi.decode(
            _actionData,
            (address, address, uint256)
        );
        IVault(vaultProxy).approveAssetSpender(asset, target, amount);
    }

    /// @dev Helper to burn fund shares for a particular account
    function __burnShares(bytes memory _actionData) private {
        (address target, uint256 amount) = abi.decode(_actionData, (address, uint256));
        IVault(vaultProxy).burnShares(target, amount);
    }

    /// @dev Helper to mint fund shares to a particular account
    function __mintShares(bytes memory _actionData) private {
        (address target, uint256 amount) = abi.decode(_actionData, (address, uint256));
        IVault(vaultProxy).mintShares(target, amount);
    }

    /// @dev Helper to remove a tracked asset from the fund
    function __removeTrackedAsset(bytes memory _actionData) private {
        address asset = abi.decode(_actionData, (address));
        IVault(vaultProxy).removeTrackedAsset(asset);
    }

    /// @dev Helper to transfer fund shares from one account to another
    function __transferShares(bytes memory _actionData) private {
        (address from, address to, uint256 amount) = abi.decode(
            _actionData,
            (address, address, uint256)
        );
        IVault(vaultProxy).transferShares(from, to, amount);
    }

    /// @dev Helper to withdraw an asset from the VaultProxy to a given account
    function __withdrawAssetTo(bytes memory _actionData) private {
        (address asset, address target, uint256 amount) = abi.decode(
            _actionData,
            (address, address, uint256)
        );
        IVault(vaultProxy).withdrawAssetTo(asset, target, amount);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the routes for the various contracts used by all funds
    /// @return feeManager_ The `FEE_MANAGER` variable value
    /// @return fundDeployer_ The `FUND_DEPLOYER` variable value
    /// @return integrationManager_ The `INTEGRATION_MANAGER` variable value
    function getLibRoutes()
        external
        view
        returns (
            address feeManager_,
            address fundDeployer_,
            address integrationManager_
        )
    {
        return (FEE_MANAGER, FUND_DEPLOYER, INTEGRATION_MANAGER);
    }
}
