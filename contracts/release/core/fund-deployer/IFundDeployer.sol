// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;

/// @title IFundDeployer Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IFundDeployer {
    enum ReleaseStatus {PreLaunch, Live, Paused}

    function getOwner() external view returns (address);

    function getReleaseStatus() external view returns (ReleaseStatus);

    function isRegisteredVaultCall(address, bytes4) external view returns (bool);
}
