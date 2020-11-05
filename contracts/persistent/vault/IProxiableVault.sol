// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

/// @title IProxiableVault Interface
/// @author Melon Council DAO <security@meloncoucil.io>
/// @dev DO NOT EDIT CONTRACT
interface IProxiableVault {
    function canMigrate(address) external view returns (bool);

    function init(
        address,
        address,
        string calldata
    ) external;

    function setAccessor(address) external;

    function setVaultLib(address) external;
}
