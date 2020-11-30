// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

/// @title ComptrollerStorage Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Contract containing all the storage vars (not constants)
/// used in the Comptroller contracts
abstract contract ComptrollerStorage {
    // Pseudo-constants (can only be set once)

    address internal denominationAsset;
    address internal vaultProxy;
    // True only for the one non-proxy
    bool internal isLib;

    // Storage

    // Allows a fund owner to override a release-level pause
    bool internal overridePause;
    // A reverse-mutex, granting atomic permission for particular contracts to make vault calls
    bool internal permissionedVaultActionAllowed;
    // A mutex to protect against reentrancy
    bool internal reentranceLocked;
    // A timelock between any "shares actions" (i.e., buy and redeem shares), per-account
    uint256 internal sharesActionTimelock;
    mapping(address => uint256) internal acctToLastSharesAction;
}
