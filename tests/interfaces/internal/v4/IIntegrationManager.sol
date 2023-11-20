// SPDX-License-Identifier: Unlicense
pragma solidity >=0.6.0 <0.9.0;

interface IIntegrationManager {
    event CallOnIntegrationExecutedForFund(
        address indexed comptrollerProxy,
        address caller,
        address indexed adapter,
        bytes4 indexed selector,
        bytes integrationData,
        address[] incomingAssets,
        uint256[] incomingAssetAmounts,
        address[] spendAssets,
        uint256[] spendAssetAmounts
    );
    event ValidatedVaultProxySetForFund(address indexed comptrollerProxy, address indexed vaultProxy);

    function activateForFund(bool) external;
    function deactivateForFund() external;
    function getFundDeployer() external view returns (address fundDeployer_);
    function getOwner() external view returns (address owner_);
    function getPolicyManager() external view returns (address policyManager_);
    function getValueInterpreter() external view returns (address valueInterpreter_);
    function getVaultProxyForFund(address _comptrollerProxy) external view returns (address vaultProxy_);
    function receiveCallFromComptroller(address _caller, uint256 _actionId, bytes memory _callArgs) external;
    function setConfigForFund(address _comptrollerProxy, address _vaultProxy, bytes memory) external;
}
