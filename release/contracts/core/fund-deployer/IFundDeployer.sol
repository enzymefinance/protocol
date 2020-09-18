// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

/// @title IFundDeployer Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IFundDeployer {
    function isRegisteredVaultCall(address, bytes4) external view returns (bool);
}
