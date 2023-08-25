// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {IDispatcher} from "../../dispatcher/IDispatcher.sol";
import {IHelperDataReader} from "./IHelperDataReader.sol";

/// @title HelperDataReaderRouter Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A peripheral contract for routing value calculation requests
/// to the correct HelperDataReader instance for a particular release
/// @dev These values should generally only be consumed from off-chain,
/// unless you understand how each release interprets each calculation
contract HelperDataReaderRouter {
    struct HelperDataReaderInfo {
        IHelperDataReader helperDataReader;
        uint8 version;
    }

    event HelperDataReaderUpdated(address indexed fundDeployer, HelperDataReaderInfo HelperDataReader);

    address private immutable DISPATCHER;

    mapping(address => HelperDataReaderInfo) private fundDeployerToHelperDataReaderInfo;

    constructor(
        address _dispatcher,
        address[] memory _fundDeployers,
        HelperDataReaderInfo[] memory _helperDataReadersInfo
    ) {
        DISPATCHER = _dispatcher;

        __setHelperDataReaders(_fundDeployers, _helperDataReadersInfo);
    }

    // EXTERNAL FUNCTIONS

    function getVaultDetails(address _vaultProxy) external returns (bytes memory data, uint8 version) {
        HelperDataReaderInfo memory helperDataReaderInfo = getHelperDataReaderForVault(_vaultProxy);

        return (helperDataReaderInfo.helperDataReader.getVaultDetails(_vaultProxy), helperDataReaderInfo.version);
    }

    function getVaultTrackedAssetsAmounts(address _vaultProxy) external returns (bytes memory data, uint8 version) {
        HelperDataReaderInfo memory helperDataReaderInfo = getHelperDataReaderForVault(_vaultProxy);

        return (
            helperDataReaderInfo.helperDataReader.getVaultTrackedAssetsAmounts(_vaultProxy),
            helperDataReaderInfo.version
        );
    }

    function getVaultActiveExternalPositionsDetails(address _vaultProxy)
        external
        returns (bytes memory data, uint8 version)
    {
        HelperDataReaderInfo memory helperDataReaderInfo = getHelperDataReaderForVault(_vaultProxy);

        return (
            helperDataReaderInfo.helperDataReader.getVaultActiveExternalPositionsDetails(_vaultProxy),
            helperDataReaderInfo.version
        );
    }

    function getVaultPoliciesDetails(address _vaultProxy) external returns (bytes memory data, uint8 version) {
        HelperDataReaderInfo memory helperDataReaderInfo = getHelperDataReaderForVault(_vaultProxy);

        return
            (helperDataReaderInfo.helperDataReader.getVaultPoliciesDetails(_vaultProxy), helperDataReaderInfo.version);
    }

    function getVaultFeesDetails(address _vaultProxy) external returns (bytes memory data, uint8 version) {
        HelperDataReaderInfo memory helperDataReaderInfo = getHelperDataReaderForVault(_vaultProxy);

        return (helperDataReaderInfo.helperDataReader.getVaultFeesDetails(_vaultProxy), helperDataReaderInfo.version);
    }

    // PUBLIC FUNCTIONS

    /// @notice Gets the HelperDataReader instance to use for a given fund
    /// @param _vaultProxy The VaultProxy of the fund
    /// @return helperDataReaderContract_ The HelperDataReader instance
    function getHelperDataReaderForVault(address _vaultProxy) public view returns (HelperDataReaderInfo memory) {
        address fundDeployer = IDispatcher(DISPATCHER).getFundDeployerForVaultProxy(_vaultProxy);
        require(fundDeployer != address(0), "getHelperDataReaderForVault: Invalid _vaultProxy");

        HelperDataReaderInfo memory helperDataReaderInfo = getHelperDataReaderInfoForFundDeployer(fundDeployer);
        require(
            address(helperDataReaderInfo.helperDataReader) != address(0),
            "getHelperDataReaderForVault: No helperDataReader set"
        );

        return helperDataReaderInfo;
    }

    ////////////////////////////
    // FUND VALUE CALCULATORS //
    ////////////////////////////

    /// @notice Sets HelperDataReader instances for a list of FundDeployer instances
    /// @param _fundDeployers The FundDeployer instances
    /// @param _helperDataReadersInfo The HelperDataReader instances corresponding
    /// to each instance in _fundDeployers
    function setHelperDataReaders(address[] memory _fundDeployers, HelperDataReaderInfo[] memory _helperDataReadersInfo)
        external
    {
        require(
            msg.sender == IDispatcher(getDispatcher()).getOwner(), "Only the Dispatcher owner can call this function"
        );

        __setHelperDataReaders(_fundDeployers, _helperDataReadersInfo);
    }

    /// @dev Helper to set HelperDataReader addresses respectively for given FundDeployers
    function __setHelperDataReaders(
        address[] memory _fundDeployers,
        HelperDataReaderInfo[] memory _helperDataReadersInfo
    ) private {
        require(_fundDeployers.length == _helperDataReadersInfo.length, "__setHelperDataReaders: Unequal array lengths");

        for (uint256 i; i < _fundDeployers.length; i++) {
            fundDeployerToHelperDataReaderInfo[_fundDeployers[i]] = _helperDataReadersInfo[i];

            emit HelperDataReaderUpdated(_fundDeployers[i], _helperDataReadersInfo[i]);
        }
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `DISPATCHER` variable
    /// @return dispatcher_ The `DISPATCHER` variable value
    function getDispatcher() public view returns (address dispatcher_) {
        return DISPATCHER;
    }

    /// @notice Gets the HelperDataReader address for a given FundDeployer
    /// @param _fundDeployer The FundDeployer for which to get the HelperDataReader address
    /// @return helperDataReader_ The HelperDataReader address
    function getHelperDataReaderInfoForFundDeployer(address _fundDeployer)
        public
        view
        returns (HelperDataReaderInfo memory helperDataReader_)
    {
        return fundDeployerToHelperDataReaderInfo[_fundDeployer];
    }
}
