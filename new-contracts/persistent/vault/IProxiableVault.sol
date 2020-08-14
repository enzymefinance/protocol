// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

/// @title IProxiableVault Interface
/// @author Melon Council DAO <security@meloncoucil.io>
/// @dev DO NOT EDIT CONTRACT
interface IProxiableVault {
    function init(
        address _owner,
        address _accessor,
        string calldata _fundName
    ) external;

    function getOwner() external view returns (address);

    function setAccessor(address) external;

    function setVaultLib(address) external;
}
