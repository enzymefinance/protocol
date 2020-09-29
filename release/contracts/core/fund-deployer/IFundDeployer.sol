// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@melonproject/persistent/contracts/dispatcher/IMigrationHookHandler.sol";

/// @title IFundDeployer Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IFundDeployer is IMigrationHookHandler {
    enum ReleaseStatus {PreLaunch, Live}

    function getOwner() external view returns (address);

    function isRegisteredVaultCall(address, bytes4) external view returns (bool);
}
