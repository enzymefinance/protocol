// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

/// @title IDispatcher Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IDispatcher {
    function cancelMigration(address, bool) external;

    function deployVaultProxy(
        address,
        address,
        address,
        string calldata
    ) external returns (address);

    function executeMigration(address, bool) external;

    function getCurrentFundDeployer() external view returns (address);

    function getMGM() external view returns (address);

    function getMigrationRequestDetailsForFund(address)
        external
        view
        returns (
            address,
            address,
            address,
            uint256
        );

    function getMTC() external view returns (address);

    function getFundDeployerForFund(address) external view returns (address);

    function setCurrentFundDeployer(address) external;

    function signalMigration(
        address,
        address,
        address,
        bool
    ) external;
}
