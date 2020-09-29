// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "../../core/fund/comptroller/IComptroller.sol";
import "../../core/fund/vault/IVault.sol";
import "../../utils/AddressArrayLib.sol";
import "../utils/ExtensionBase.sol";
import "../utils/FundDeployerOwnerMixin.sol";
import "./IPolicy.sol";
import "./IPolicyManager.sol";

/// @title PolicyManager Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Manages policies for funds
contract PolicyManager is IPolicyManager, ExtensionBase, FundDeployerOwnerMixin {
    // TODO: add activation and deactivation?

    using AddressArrayLib for address[];
    using EnumerableSet for EnumerableSet.AddressSet;

    // EVENTS

    event PolicyDeregistered(address indexed policy, string indexed identifier);

    event PolicyDisabledForFund(address indexed comptrollerProxy, address indexed policy);

    event PolicyEnabledForFund(
        address indexed comptrollerProxy,
        address indexed policy,
        bytes settingsData
    );

    event PolicyRegistered(address indexed policy, string indexed identifier);

    // STORAGE

    EnumerableSet.AddressSet private registeredPolicies;
    mapping(address => EnumerableSet.AddressSet) private comptrollerProxyToPolicies;

    // MODIFIERS

    modifier onlyFundOwner(address _comptrollerProxy) {
        require(
            msg.sender == IVault(IComptroller(_comptrollerProxy).getVaultProxy()).getOwner(),
            "Only the fund owner can call this function"
        );
        _;
    }

    // CONSTRUCTOR

    constructor(address _fundDeployer) public FundDeployerOwnerMixin(_fundDeployer) {}

    // EXTERNAL FUNCTIONS

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

        // TODO: delete storage on the policy?
    }

    function validatePolicies(
        address _comptrollerProxy,
        PolicyHook _hook,
        PolicyHookExecutionTime _executionTime,
        bytes calldata _validationData
    ) external override {
        __validatePolicies(_comptrollerProxy, _hook, _executionTime, _validationData);
    }

    /// @notice Enable policies for use in a fund
    /// @param _configData Encoded config data
    function setConfigForFund(bytes calldata _configData) external override {
        address comptrollerProxy = msg.sender;

        (address[] memory policies, bytes[] memory settingsData) = abi.decode(
            _configData,
            (address[], bytes[])
        );

        // Sanity check
        require(
            policies.length == settingsData.length,
            "setFundConfig: policies and settingsData array lengths unequal"
        );
        require(policies.isUniqueSet(), "setFundConfig: policies cannot include duplicates");

        // Enable each policy with settings
        for (uint256 i = 0; i < policies.length; i++) {
            require(policyIsRegistered(policies[i]), "setFundConfig: Policy is not registered");

            // Set fund config on policy
            IPolicy(policies[i]).addFundSettings(comptrollerProxy, settingsData[i]);

            // Add policy
            comptrollerProxyToPolicies[comptrollerProxy].add(policies[i]);

            emit PolicyEnabledForFund(comptrollerProxy, policies[i], settingsData[i]);
        }
    }

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

    // PRIVATE FUNCTIONS

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

    /// @notice Get a list of enabled policies for a given fund
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

    /// @notice Check is a policy is enabled for the fund
    function policyIsEnabledForFund(address _comptrollerProxy, address _policy)
        public
        view
        returns (bool)
    {
        return comptrollerProxyToPolicies[_comptrollerProxy].contains(_policy);
    }

    /// @notice Check whether a policy is registered
    /// @param _policy The address of the policy to check
    /// @return True if the policy is registered
    function policyIsRegistered(address _policy) public view returns (bool) {
        return registeredPolicies.contains(_policy);
    }
}
