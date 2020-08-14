// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

/// @title IMigrationHookHandler Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IMigrationHookHandler {
    // TODO: consider aggregating params into a single struct... but would require experimental ABI encoder v2
    function postCancelMigrationOriginHook(
        address _vaultProxy,
        address _nextRelease,
        address _nextAccessor,
        address _nextVaultLib,
        uint256 _signaledTimestamp
    ) external;

    function postCancelMigrationTargetHook(
        address _vaultProxy,
        address _prevRelease,
        address _nextAccessor,
        address _nextVaultLib,
        uint256 _signaledTimestamp
    ) external;

    function preMigrateOriginHook(
        address _vaultProxy,
        address _nextRelease,
        address _nextAccessor,
        address _nextVaultLib,
        uint256 _signaledTimestamp
    ) external;

    function postMigrateOriginHook(
        address _vaultProxy,
        address _nextRelease,
        address _nextAccessor,
        address _nextVaultLib,
        uint256 _signaledTimestamp
    ) external;

    function preSignalMigrationOriginHook(
        address _vaultProxy,
        address _nextRelease,
        address _nextAccessor,
        address _nextVaultLib
    ) external;

    function postSignalMigrationOriginHook(
        address _vaultProxy,
        address _nextRelease,
        address _nextAccessor,
        address _nextVaultLib
    ) external;
}
