// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;

/// @title IPermissionedVaultActionLib Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IPermissionedVaultActionLib {
    enum VaultAction {
        None,
        BurnShares,
        MintShares,
        TransferShares,
        ApproveAssetSpender,
        WithdrawAssetTo,
        AddTrackedAsset,
        RemoveTrackedAsset
    }

    function dispatchAction(VaultAction, bytes calldata) external;
}
