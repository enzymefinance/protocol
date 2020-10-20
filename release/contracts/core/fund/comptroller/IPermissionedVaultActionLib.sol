// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../vault/IVault.sol";

/// @title IPermissionedVaultActionLib Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IPermissionedVaultActionLib {
    function dispatchAction(IVault.VaultAction, bytes calldata) external;
}
