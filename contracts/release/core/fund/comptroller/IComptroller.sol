// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

import {IVault} from "../vault/IVault.sol";

/// @title IComptroller Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IComptroller {
    function activate(bool _isMigration) external;

    function buyBackProtocolFeeShares(uint256 _sharesAmount) external;

    function buyShares(uint256 _investmentAmount, uint256 _minSharesQuantity)
        external
        returns (uint256 sharesReceived_);

    function buySharesOnBehalf(address _buyer, uint256 _investmentAmount, uint256 _minSharesQuantity)
        external
        returns (uint256 sharesReceived_);

    function calcGav() external returns (uint256 gav_);

    function calcGrossShareValue() external returns (uint256 grossShareValue_);

    function callOnExtension(address _extension, uint256 _actionId, bytes calldata _callArgs) external;

    function deployGasRelayPaymaster() external;

    function depositToGasRelayPaymaster() external;

    function destructActivated() external;

    function doesAutoProtocolFeeSharesBuyback() external view returns (bool doesAutoBuyback_);

    function getDenominationAsset() external view returns (address denominationAsset_);

    function getDispatcher() external view returns (address dispatcher_);

    function getExternalPositionManager() external view returns (address externalPositionManager_);

    function getFeeManager() external view returns (address feeManager_);

    function getFundDeployer() external view returns (address fundDeployer_);

    function getGasRelayPaymaster() external view returns (address gasRelayPaymaster_);

    function getIntegrationManager() external view returns (address integrationManager_);

    function getLastSharesBoughtTimestampForAccount(address _who)
        external
        view
        returns (uint256 lastSharesBoughtTimestamp_);

    function getMlnToken() external view returns (address mlnToken_);

    function getPolicyManager() external view returns (address policyManager_);

    function getProtocolFeeReserve() external view returns (address protocolFeeReserve_);

    function getSharesActionTimelock() external view returns (uint256 sharesActionTimelock_);

    function getValueInterpreter() external view returns (address valueInterpreter_);

    function getVaultProxy() external view returns (address vaultProxy_);

    function getWethToken() external view returns (address wethToken_);

    function init(
        address _vaultProxy,
        address _denominationAsset,
        uint256 _sharesActionTimelock,
        bytes calldata _feeManagerConfigData,
        bytes calldata _policyManagerConfigData
    ) external;

    function permissionedVaultAction(IVault.VaultAction _action, bytes calldata _actionData) external;

    function preTransferSharesHook(address _sender, address _recipient, uint256 _amount) external;

    function preTransferSharesHookFreelyTransferable(address _sender) external view;

    function redeemSharesForSpecificAssets(
        address _recipient,
        uint256 _sharesQuantity,
        address[] calldata _payoutAssets,
        uint256[] calldata _payoutAssetPercentages
    ) external returns (uint256[] memory payoutAmounts_);

    function redeemSharesInKind(
        address _recipient,
        uint256 _sharesQuantity,
        address[] calldata _additionalAssets,
        address[] calldata _assetsToSkip
    ) external returns (address[] memory payoutAssets_, uint256[] memory payoutAmounts_);

    function setAutoProtocolFeeSharesBuyback(bool _nextAutoProtocolFeeSharesBuyback) external;

    function setGasRelayPaymaster(address _nextGasRelayPaymaster) external;

    function shutdownGasRelayPaymaster() external;

    function vaultCallOnContract(address _contract, bytes4 _selector, bytes calldata _encodedArgs)
        external
        returns (bytes memory returnData_);
}
