// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

/// @title IMigrationHookHandler Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IMigrationHookHandler {
    enum MigrationOutHook {PreSignal, PostSignal, PreMigrate, PostMigrate, PostCancel}

    function implementMigrationInCancelHook(
        address,
        address,
        address,
        address
    ) external;

    function implementMigrationOutHook(
        MigrationOutHook,
        address,
        address,
        address,
        address
    ) external;
}
