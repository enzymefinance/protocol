// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@melonproject/persistent/contracts/dispatcher/IMigrationHookHandler.sol";

/// @title MigrationHookHandlerMixin Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice TODO
abstract contract MigrationHookHandlerMixin is IMigrationHookHandler {
    function postCancelMigrationOriginHook(
        address _vaultProxy,
        address _nextRelease,
        address _nextAccessor,
        address _nextVaultLib,
        uint256 _signaledTimestamp
    ) external virtual override {
        // UNIMPLEMENTED
    }

    function postCancelMigrationTargetHook(
        address _vaultProxy,
        address _prevRelease,
        address _nextAccessor,
        address _nextVaultLib,
        uint256 _signaledTimestamp
    ) external virtual override {
        // UNIMPLEMENTED
    }

    function preMigrateOriginHook(
        address _vaultProxy,
        address _nextRelease,
        address _nextAccessor,
        address _nextVaultLib,
        uint256 _signaledTimestamp
    ) external virtual override {
        // UNIMPLEMENTED
    }

    function postMigrateOriginHook(
        address _vaultProxy,
        address _nextRelease,
        address _nextAccessor,
        address _nextVaultLib,
        uint256 _signaledTimestamp
    ) external virtual override {
        // UNIMPLEMENTED
    }

    function preSignalMigrationOriginHook(
        address _vaultProxy,
        address _nextRelease,
        address _nextAccessor,
        address _nextVaultLib
    ) external virtual override {
        // UNIMPLEMENTED
    }

    function postSignalMigrationOriginHook(
        address _vaultProxy,
        address _nextRelease,
        address _nextAccessor,
        address _nextVaultLib
    ) external virtual override {
        // UNIMPLEMENTED
    }
}
