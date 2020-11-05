// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

/// @title IDispatcher Interface
/// @author Melon Council DAO <security@meloncoucil.io>
interface IDispatcher {
    function cancelMigration(address, bool) external;

    function claimOwnership() external;

    function deployVaultProxy(
        address,
        address,
        address,
        string calldata
    ) external returns (address);

    function executeMigration(address, bool) external;

    function getCurrentFundDeployer() external view returns (address);

    function getFundDeployerForVaultProxy(address) external view returns (address);

    function getMigrationRequestDetailsForVaultProxy(address)
        external
        view
        returns (
            address,
            address,
            address,
            uint256
        );

    function getMigrationTimelock() external view returns (uint256);

    function getNominatedOwner() external view returns (address);

    function getOwner() external view returns (address);

    function getSharesTokenSymbol() external view returns (string memory);

    function getTimelockRemainingForMigrationRequest(address) external view returns (uint256);

    function hasExecutableMigrationRequest(address) external view returns (bool);

    function hasMigrationRequest(address) external view returns (bool);

    function removeNominatedOwner() external;

    function setCurrentFundDeployer(address) external;

    function setMigrationTimelock(uint256) external;

    function setNominatedOwner(address) external;

    function setSharesTokenSymbol(string calldata) external;

    function signalMigration(
        address,
        address,
        address,
        bool
    ) external;
}
