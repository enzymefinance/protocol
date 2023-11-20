// SPDX-License-Identifier: Unlicense
pragma solidity >=0.6.0 <0.9.0;

interface IPolicyManager {
    event PolicyDisabledOnHookForFund(address indexed comptrollerProxy, address indexed policy, uint8 indexed hook);
    event PolicyEnabledForFund(address indexed comptrollerProxy, address indexed policy, bytes settingsData);
    event ValidatedVaultProxySetForFund(address indexed comptrollerProxy, address indexed vaultProxy);

    function activateForFund(bool _isMigratedFund) external;
    function deactivateForFund() external;
    function disablePolicyForFund(address _comptrollerProxy, address _policy) external;
    function enablePolicyForFund(address _comptrollerProxy, address _policy, bytes memory _settingsData) external;
    function getEnabledPoliciesForFund(address _comptrollerProxy)
        external
        view
        returns (address[] memory enabledPolicies_);
    function getEnabledPoliciesOnHookForFund(address _comptrollerProxy, uint8 _hook)
        external
        view
        returns (address[] memory enabledPolicies_);
    function getFundDeployer() external view returns (address fundDeployer_);
    function getGasRelayPaymasterFactory() external view returns (address gasRelayPaymasterFactory_);
    function getGasRelayTrustedForwarder() external view returns (address trustedForwarder_);
    function getOwner() external view returns (address owner_);
    function getVaultProxyForFund(address _comptrollerProxy) external view returns (address vaultProxy_);
    function policyIsEnabledOnHookForFund(address _comptrollerProxy, uint8 _hook, address _policy)
        external
        view
        returns (bool isEnabled_);
    function receiveCallFromComptroller(address, uint256, bytes memory) external;
    function setConfigForFund(address _comptrollerProxy, address _vaultProxy, bytes memory _configData) external;
    function updatePolicySettingsForFund(address _comptrollerProxy, address _policy, bytes memory _settingsData)
        external;
    function validatePolicies(address _comptrollerProxy, uint8 _hook, bytes memory _validationData) external;
}
