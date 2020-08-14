// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

/// @title IPersistentTopLevel Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IPersistentTopLevel {
    function cancelMigration(address _vaultProxy) external;

    function deployVaultProxy(
        address _vaultLib,
        address _owner,
        address _accessor,
        string calldata _fundName
    ) external returns (address);

    function executeMigration(address _vaultProxy) external;

    function getMGM() external view returns (address);

    function getMTC() external view returns (address);

    function signalMigration(
        address _vaultProxy,
        address _nextAccessor,
        address _nextVaultLib
    ) external;
}
