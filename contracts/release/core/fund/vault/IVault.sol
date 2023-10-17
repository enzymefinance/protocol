// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

import {IExternalPositionVault} from "../../../../persistent/vault/interfaces/IExternalPositionVault.sol";
import {IFreelyTransferableSharesVault} from
    "../../../../persistent/vault/interfaces/IFreelyTransferableSharesVault.sol";
import {IMigratableVault} from "../../../../persistent/vault/interfaces/IMigratableVault.sol";
import {IVaultCore} from "../../../../persistent/vault/interfaces/IVaultCore.sol";

/// @title IVault Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IVault is IVaultCore, IMigratableVault, IFreelyTransferableSharesVault, IExternalPositionVault {
    enum VaultAction {
        None,
        // Shares management
        BurnShares,
        MintShares,
        TransferShares,
        // Asset management
        AddTrackedAsset,
        ApproveAssetSpender,
        RemoveTrackedAsset,
        WithdrawAssetTo,
        // External position management
        AddExternalPosition,
        CallOnExternalPosition,
        RemoveExternalPosition
    }

    function addAssetManagers(address[] calldata _managers) external;

    function addTrackedAsset(address _asset) external;

    function burnShares(address _target, uint256 _amount) external;

    function buyBackProtocolFeeShares(uint256 _sharesAmount, uint256 _mlnValue, uint256 _gav) external;

    function callOnContract(address _contract, bytes calldata _callData) external returns (bytes memory returnData_);

    function canManageAssets(address _who) external view returns (bool canManageAssets_);

    function canRelayCalls(address _who) external view returns (bool canRelayCalls_);

    function claimOwnership() external;

    function getActiveExternalPositions() external view returns (address[] memory activeExternalPositions_);

    function getExternalPositionManager() external view returns (address externalPositionManager_);

    function getFundDeployer() external view returns (address fundDeployer_);

    function getMlnBurner() external view returns (address mlnBurner_);

    function getMlnToken() external view returns (address mlnToken_);

    function getNominatedOwner() external view returns (address nominatedOwner_);

    function getPositionsLimit() external view returns (uint256 positionsLimit_);

    function getProtocolFeeReserve() external view returns (address protocolFeeReserve_);

    function getProtocolFeeTracker() external view returns (address protocolFeeTracker_);

    function getTrackedAssets() external view returns (address[] memory trackedAssets_);

    function isActiveExternalPosition(address _externalPosition)
        external
        view
        returns (bool isActiveExternalPosition_);

    function isAssetManager(address _who) external view returns (bool isAssetManager_);

    function isTrackedAsset(address _asset) external view returns (bool isTrackedAsset_);

    function mintShares(address _target, uint256 _amount) external;

    function payProtocolFee() external;

    function receiveValidatedVaultAction(VaultAction _action, bytes calldata _actionData) external;

    function removeAssetManagers(address[] calldata _managers) external;

    function removeNominatedOwner() external;

    function setAccessorForFundReconfiguration(address _nextAccessor) external;

    function setFreelyTransferableShares() external;

    function setMigrator(address _nextMigrator) external;

    function setName(string calldata _nextName) external;

    function setNominatedOwner(address _nextNominatedOwner) external;

    function setSymbol(string calldata _nextSymbol) external;

    function transferShares(address _from, address _to, uint256 _amount) external;

    function withdrawAssetTo(address _asset, address _target, uint256 _amount) external;
}
