// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;

/// @title IMigratableVault Interface
/// @author Melon Council DAO <security@meloncoucil.io>
/// @dev DO NOT EDIT CONTRACT
interface IMigratableVault {
    function canMigrate(address _who) external view returns (bool canMigrate_);

    function init(
        address _owner,
        address _accessor,
        string calldata _fundName
    ) external;

    function setAccessor(address _nextAccessor) external;

    function setVaultLib(address _nextVaultLib) external;
}
