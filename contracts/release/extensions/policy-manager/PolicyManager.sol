// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "../../core/fund/vault/IVault.sol";
import "../utils/ExtensionBase.sol";
import "../utils/FundDeployerOwnerMixin.sol";
import "./IPolicy.sol";
import "./IPolicyManager.sol";

/// @title PolicyManager Contract
/// @author Enzyme Council <security@enzyme.finance>
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

    event PolicyRegistered(
        address indexed policy,
        string indexed identifier,
        PolicyHook[] implementedHooks
    );

    EnumerableSet.AddressSet private registeredPolicies;
    mapping(address => mapping(PolicyHook => bool)) private policyToHookToIsImplemented;
    mapping(address => EnumerableSet.AddressSet) private comptrollerProxyToPolicies;

    modifier onlyBuySharesHooks(address _policy) {
        require(
            !policyImplementsHook(_policy, PolicyHook.PreCallOnIntegration) &&
                !policyImplementsHook(_policy, PolicyHook.PostCallOnIntegration),
            "onlyBuySharesHooks: Disallowed hook"
        );
        _;
    }

    modifier onlyEnabledPolicyForFund(address _comptrollerProxy, address _policy) {
        require(
            policyIsEnabledForFund(_comptrollerProxy, _policy),
            "onlyEnabledPolicyForFund: Policy not enabled"
        );
        _;
    }

    constructor(address _fundDeployer) public FundDeployerOwnerMixin(_fundDeployer) {}

    // EXTERNAL FUNCTIONS

    /// @notice Validates and initializes policies as necessary prior to fund activation
    /// @param _isMigratedFund True if the fund is migrating to this release
    /// @dev Caller is expected to be a valid ComptrollerProxy, but there isn't a need to validate.
    function activateForFund(bool _isMigratedFund) external override {
        address vaultProxy = __setValidatedVaultProxy(msg.sender);

        // Policies must assert that they are congruent with migrated vault state
        if (_isMigratedFund) {
            address[] memory enabledPolicies = getEnabledPoliciesForFund(msg.sender);
            for (uint256 i; i < enabledPolicies.length; i++) {
                __activatePolicyForFund(msg.sender, vaultProxy, enabledPolicies[i]);
            }
        }
    }

    /// @notice Deactivates policies for a fund by destroying storage
    function deactivateForFund() external override {
        delete comptrollerProxyToVaultProxy[msg.sender];

        for (uint256 i = comptrollerProxyToPolicies[msg.sender].length(); i > 0; i--) {
            comptrollerProxyToPolicies[msg.sender].remove(
                comptrollerProxyToPolicies[msg.sender].at(i - 1)
            );
        }
    }

    /// @notice Disables a policy for a fund
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _policy The policy address to disable
    function disablePolicyForFund(address _comptrollerProxy, address _policy)
        external
        onlyBuySharesHooks(_policy)
        onlyEnabledPolicyForFund(_comptrollerProxy, _policy)
    {
        __validateIsFundOwner(getVaultProxyForFund(_comptrollerProxy), msg.sender);

        comptrollerProxyToPolicies[_comptrollerProxy].remove(_policy);

        emit PolicyDisabledForFund(_comptrollerProxy, _policy);
    }

    /// @notice Enables a policy for a fund
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _policy The policy address to enable
    /// @param _settingsData The encoded settings data with which to configure the policy
    /// @dev Disabling a policy does not delete fund config on the policy, so if a policy is
    /// disabled and then enabled again, its initial state will be the previous config. It is the
    /// policy's job to determine how to merge that config with the _settingsData param in this function.
    function enablePolicyForFund(
        address _comptrollerProxy,
        address _policy,
        bytes calldata _settingsData
    ) external onlyBuySharesHooks(_policy) {
        address vaultProxy = getVaultProxyForFund(_comptrollerProxy);
        __validateIsFundOwner(vaultProxy, msg.sender);

        __enablePolicyForFund(_comptrollerProxy, _policy, _settingsData);

        __activatePolicyForFund(_comptrollerProxy, vaultProxy, _policy);
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
        for (uint256 i; i < policies.length; i++) {
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
    ) external onlyBuySharesHooks(_policy) onlyEnabledPolicyForFund(_comptrollerProxy, _policy) {
        address vaultProxy = getVaultProxyForFund(_comptrollerProxy);
        __validateIsFundOwner(vaultProxy, msg.sender);

        IPolicy(_policy).updateFundSettings(_comptrollerProxy, vaultProxy, _settingsData);
    }

    /// @notice Validates all policies that apply to a given hook for a fund
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _hook The PolicyHook for which to validate policies
    /// @param _validationData The encoded data with which to validate the filtered policies
    function validatePolicies(
        address _comptrollerProxy,
        PolicyHook _hook,
        bytes calldata _validationData
    ) external override {
        address vaultProxy = getVaultProxyForFund(_comptrollerProxy);
        address[] memory policies = getEnabledPoliciesForFund(_comptrollerProxy);
        for (uint256 i; i < policies.length; i++) {
            if (!policyImplementsHook(policies[i], _hook)) {
                continue;
            }

            require(
                IPolicy(policies[i]).validateRule(
                    _comptrollerProxy,
                    vaultProxy,
                    _hook,
                    _validationData
                ),
                string(
                    abi.encodePacked(
                        "Rule evaluated to false: ",
                        IPolicy(policies[i]).identifier()
                    )
                )
            );
        }
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to activate a policy for a fund
    function __activatePolicyForFund(
        address _comptrollerProxy,
        address _vaultProxy,
        address _policy
    ) private {
        IPolicy(_policy).activateForFund(_comptrollerProxy, _vaultProxy);
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

    /// @dev Helper to validate fund owner.
    /// Preferred to a modifier because allows gas savings if re-using _vaultProxy.
    function __validateIsFundOwner(address _vaultProxy, address _who) private view {
        require(
            _who == IVault(_vaultProxy).getOwner(),
            "Only the fund owner can call this function"
        );
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

            // Store the hooks that a policy implements for later use.
            // Fronts the gas for calls to check if a hook is implemented, and guarantees
            // that the implementsHooks return value does not change post-registration.
            IPolicy policyContract = IPolicy(_policies[i]);
            PolicyHook[] memory implementedHooks = policyContract.implementedHooks();
            for (uint256 j; j < implementedHooks.length; j++) {
                policyToHookToIsImplemented[_policies[i]][implementedHooks[j]] = true;
            }

            emit PolicyRegistered(_policies[i], policyContract.identifier(), implementedHooks);
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
        for (uint256 i; i < registeredPoliciesArray_.length; i++) {
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
        for (uint256 i; i < enabledPolicies_.length; i++) {
            enabledPolicies_[i] = comptrollerProxyToPolicies[_comptrollerProxy].at(i);
        }
    }

    /// @notice Checks if a policy implements a particular hook
    /// @param _policy The address of the policy to check
    /// @param _hook The PolicyHook to check
    /// @return implementsHook_ True if the policy implements the hook
    function policyImplementsHook(address _policy, PolicyHook _hook)
        public
        view
        returns (bool implementsHook_)
    {
        return policyToHookToIsImplemented[_policy][_hook];
    }

    /// @notice Check if a policy is enabled for the fund
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
