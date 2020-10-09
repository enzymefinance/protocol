// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "../../core/fund/comptroller/IComptroller.sol";
import "../../core/fund/vault/IVault.sol";
import "../utils/ExtensionBase.sol";
import "../utils/FundDeployerOwnerMixin.sol";
import "./IPolicy.sol";
import "./IPolicyManager.sol";

/// @title PolicyManager Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Manages policies for funds
contract PolicyManager is IPolicyManager, ExtensionBase, FundDeployerOwnerMixin {
    using EnumerableSet for EnumerableSet.AddressSet;

    event PolicyDeregistered(address indexed policy, string indexed identifier);

    event PolicyDisabledForFund(address indexed comptrollerProxy, address indexed policy);

    event PolicyEnabledForFund(
        address indexed comptrollerProxy,
        address indexed policy,
        bytes settingsData
    );

    event PolicyRegistered(address indexed policy, string indexed identifier);

    EnumerableSet.AddressSet private registeredPolicies;
    mapping(address => EnumerableSet.AddressSet) private comptrollerProxyToPolicies;

    modifier onlyFundOwner(address _comptrollerProxy) {
        require(
            msg.sender == IVault(IComptroller(_comptrollerProxy).getVaultProxy()).getOwner(),
            "Only the fund owner can call this function"
        );
        _;
    }

    constructor(address _fundDeployer) public FundDeployerOwnerMixin(_fundDeployer) {}

    // EXTERNAL FUNCTIONS

    /// @notice Validates and initializes policies as necessary prior to fund activation
    /// @dev Caller is expected to be a valid ComptrollerProxy, but there isn't a need to validate.
    function activateForFund() external override {
        address[] memory enabledPolicies = getEnabledPoliciesForFund(msg.sender);
        for (uint256 i; i < enabledPolicies.length; i++) {
            __activatePolicyForFund(msg.sender, enabledPolicies[i]);
        }
    }

    /// @notice Disables a policy for a fund
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _policy The Policy contract to disable
    function disablePolicyForFund(address _comptrollerProxy, address _policy)
        external
        onlyFundOwner(_comptrollerProxy)
    {
        require(
            policyIsEnabledForFund(_comptrollerProxy, _policy),
            "disablePolicyForFund: policy not enabled"
        );
        require(
            IPolicy(_policy).policyHook() == PolicyHook.BuyShares,
            "disablePolicyForFund: only BuyShares policies can be disabled"
        );

        comptrollerProxyToPolicies[_comptrollerProxy].remove(_policy);

        emit PolicyDisabledForFund(_comptrollerProxy, _policy);
    }

    /// @notice Enables a policy for a fund
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _policy The Policy contract to enable
    /// @param _settingsData The encoded settings data with which to configure the policy
    /// @dev Disabling a policy does not delete fund config on the policy, so if a policy is
    /// disabled and then enabled again, its initial state will be the previous config. It is the
    /// policy's job to determine how to merge that config with the _settingsData param in this function.
    function enablePolicyForFund(
        address _comptrollerProxy,
        address _policy,
        bytes calldata _settingsData
    ) external onlyFundOwner(_comptrollerProxy) {
        require(
            IPolicy(_policy).policyHook() == PolicyHook.BuyShares,
            "enablePolicyForFund: only BuyShares policies can be enabled after fund creation"
        );

        __enablePolicyForFund(_comptrollerProxy, _policy, _settingsData);

        // The current BuyShares policy does not do anything on activation,
        // but best to keep this here for future policies.
        __activatePolicyForFund(_comptrollerProxy, _policy);
    }

    /// @notice Enable policies for use in a fund
    /// @param _configData Encoded config data
    /// @dev Only called during init() on ComptrollerProxy deployment
    function setConfigForFund(bytes calldata _configData) external override {
        (address[] memory policies, bytes[] memory settingsData) = abi.decode(
            _configData,
            (address[], bytes[])
        );

        // Sanity check
        require(
            policies.length == settingsData.length,
            "setConfigForFund: policies and settingsData array lengths unequal"
        );

        // Enable each policy with settings
        for (uint256 i = 0; i < policies.length; i++) {
            __enablePolicyForFund(msg.sender, policies[i], settingsData[i]);
        }
    }

    /// @notice Updates policy settings for a fund
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _policy The Policy contract to update
    /// @param _settingsData The encoded settings data with which to update the policy config
    function updatePolicySettingsForFund(
        address _comptrollerProxy,
        address _policy,
        bytes calldata _settingsData
    ) external onlyFundOwner(_comptrollerProxy) {
        require(
            policyIsEnabledForFund(_comptrollerProxy, _policy),
            "updatePolicySettingsForFund: policy not enabled"
        );

        IPolicy(_policy).updateFundSettings(_comptrollerProxy, _settingsData);
    }

    /// @notice Validates all policies that apply to a given hook and execution time for a fund
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _hook The PolicyHook with which to filter policies
    /// @param _executionTime The PolicyHookExecutionTime with which to filter policies
    /// @param _validationData The encoded data with which to validate the filtered policies
    function validatePolicies(
        address _comptrollerProxy,
        PolicyHook _hook,
        PolicyHookExecutionTime _executionTime,
        bytes calldata _validationData
    ) external override {
        __validatePolicies(_comptrollerProxy, _hook, _executionTime, _validationData);
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to activate a policy for a fund
    function __activatePolicyForFund(address _comptrollerProxy, address _policy) private {
        IPolicy(_policy).activateForFund(_comptrollerProxy);
    }

    /// @dev Helper to set config and enable policies for a fund
    function __enablePolicyForFund(
        address _comptrollerProxy,
        address _policy,
        bytes memory _settingsData
    ) private {
        require(
            !policyIsEnabledForFund(_comptrollerProxy, _policy),
            "__enablePolicyForFund: policy already enabled"
        );
        require(policyIsRegistered(_policy), "__enablePolicyForFund: Policy is not registered");

        // Set fund config on policy
        if (_settingsData.length > 0) {
            IPolicy(_policy).addFundSettings(_comptrollerProxy, _settingsData);
        }

        // Add policy
        comptrollerProxyToPolicies[_comptrollerProxy].add(_policy);

        emit PolicyEnabledForFund(_comptrollerProxy, _policy, _settingsData);
    }

    /// @notice Helper to validate policies
    function __validatePolicies(
        address _comptrollerProxy,
        PolicyHook _hook,
        PolicyHookExecutionTime _executionTime,
        bytes memory _validationData
    ) private {
        address[] memory policies = getEnabledPoliciesForFund(_comptrollerProxy);
        for (uint256 i = 0; i < policies.length; i++) {
            if (
                IPolicy(policies[i]).policyHook() == _hook &&
                IPolicy(policies[i]).policyHookExecutionTime() == _executionTime
            ) {
                require(
                    IPolicy(policies[i]).validateRule(_comptrollerProxy, _validationData),
                    string(
                        abi.encodePacked(
                            "Rule evaluated to false: ",
                            IPolicy(policies[i]).identifier()
                        )
                    )
                );
            }
        }
    }

    ///////////////////////
    // POLICIES REGISTRY //
    ///////////////////////

    /// @notice Remove policies from the list of registered policies
    /// @param _policies Addresses of policies to be registered
    function deregisterPolicies(address[] calldata _policies) external onlyFundDeployerOwner {
        require(_policies.length > 0, "deregisterPolicies: _policies cannot be empty");

        for (uint256 i; i < _policies.length; i++) {
            require(
                policyIsRegistered(_policies[i]),
                "deregisterPolicies: policy is not registered"
            );

            registeredPolicies.remove(_policies[i]);

            emit PolicyDeregistered(_policies[i], IPolicy(_policies[i]).identifier());
        }
    }

    /// @notice Add policies to the list of registered policies
    /// @param _policies Addresses of policies to be registered
    function registerPolicies(address[] calldata _policies) external onlyFundDeployerOwner {
        require(_policies.length > 0, "registerPolicies: _policies cannot be empty");

        for (uint256 i; i < _policies.length; i++) {
            require(
                !policyIsRegistered(_policies[i]),
                "registerPolicies: policy already registered"
            );

            registeredPolicies.add(_policies[i]);

            emit PolicyRegistered(_policies[i], IPolicy(_policies[i]).identifier());
        }
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Get all registered policies
    /// @return registeredPoliciesArray_ A list of all registered policy addresses
    function getRegisteredPolicies()
        external
        view
        returns (address[] memory registeredPoliciesArray_)
    {
        registeredPoliciesArray_ = new address[](registeredPolicies.length());
        for (uint256 i = 0; i < registeredPoliciesArray_.length; i++) {
            registeredPoliciesArray_[i] = registeredPolicies.at(i);
        }
    }

    /// @notice Get a list of enabled policies for a given fund
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @return enabledPolicies_ An array of enabled policy addresses
    function getEnabledPoliciesForFund(address _comptrollerProxy)
        public
        view
        returns (address[] memory enabledPolicies_)
    {
        enabledPolicies_ = new address[](comptrollerProxyToPolicies[_comptrollerProxy].length());
        for (uint256 i = 0; i < enabledPolicies_.length; i++) {
            enabledPolicies_[i] = comptrollerProxyToPolicies[_comptrollerProxy].at(i);
        }
    }

    /// @notice Check is a policy is enabled for the fund
    /// @param _comptrollerProxy The ComptrollerProxy of the fund to check
    /// @param _policy The address of the policy to check
    /// @return isEnabled_ True if the policy is enabled for the fund
    function policyIsEnabledForFund(address _comptrollerProxy, address _policy)
        public
        view
        returns (bool isEnabled_)
    {
        return comptrollerProxyToPolicies[_comptrollerProxy].contains(_policy);
    }

    /// @notice Check whether a policy is registered
    /// @param _policy The address of the policy to check
    /// @return isRegistered_ True if the policy is registered
    function policyIsRegistered(address _policy) public view returns (bool isRegistered_) {
        return registeredPolicies.contains(_policy);
    }
}
