// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "../../core/fund/comptroller/IComptroller.sol";
import "../../core/fund/vault/IVault.sol";
import "../../core/fund-deployer/utils/FundDeployerOwnable.sol";
import "../../utils/AddressArrayLib.sol";
import "./IPolicy.sol";
import "./IPolicyManager.sol";

/// @title PolicyManager Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Manages policies for funds
contract PolicyManager is IPolicyManager, FundDeployerOwnable {
    using AddressArrayLib for address[];
    using EnumerableSet for EnumerableSet.AddressSet;

    event PolicyRegistered(address indexed policy, string indexed identifier);

    event PolicyDeregistered(address indexed policy, string indexed identifier);

    event PolicyEnabledForFund(
        address indexed comptrollerProxy,
        address indexed policy,
        bytes settingsData
    );

    EnumerableSet.AddressSet internal registeredPolicies;
    mapping(address => EnumerableSet.AddressSet) internal comptrollerProxyToPolicies;

    constructor(address _fundDeployer) public FundDeployerOwnable(_fundDeployer) {}

    // EXTERNAL FUNCTIONS

    function preValidatePolicies(
        address _comptrollerProxy,
        PolicyHook _hook,
        bytes calldata _validationData
    ) external override {
        __validatePolicies(_comptrollerProxy, _hook, PolicyHookExecutionTime.Pre, _validationData);
    }

    function postValidatePolicies(
        address _comptrollerProxy,
        PolicyHook _hook,
        bytes calldata _validationData
    ) external override {
        __validatePolicies(
            _comptrollerProxy,
            _hook,
            PolicyHookExecutionTime.Post,
            _validationData
        );
    }

    /// @notice Enable policies for use in a fund
    /// @param _configData Encoded config data
    function setFundConfig(bytes calldata _configData) external override {
        (address[] memory policies, bytes[] memory settingsData) = abi.decode(
            _configData,
            (address[], bytes[])
        );
        if (policies.length == 0) {
            return;
        }

        // Sanity check
        require(policies.length > 0, "setFundConfig: policies cannot be empty");
        require(
            policies.length == settingsData.length,
            "setFundConfig: policies and settingsData array lengths unequal"
        );
        require(policies.isUniqueSet(), "setFundConfig: policies cannot include duplicates");

        // Enable each policy with settings
        address comptrollerProxy = msg.sender;
        for (uint256 i = 0; i < policies.length; i++) {
            require(policyIsRegistered(policies[i]), "setFundConfig: Policy is not registered");

            // Set fund config on policy
            IPolicy(policies[i]).addFundSettings(comptrollerProxy, settingsData[i]);

            // Add policy
            comptrollerProxyToPolicies[comptrollerProxy].add(policies[i]);

            emit PolicyEnabledForFund(comptrollerProxy, policies[i], settingsData[i]);
        }
    }

    function updatePolicySettings(address _caller, bytes calldata _callArgs) external {
        // TODO: no need to verify whether caller is actual ComptrollerProxy?

        // TODO: allow other roles to do this?
        require(
            _caller == IVault(IComptroller(msg.sender).getVaultProxy()).getOwner(),
            "updatePolicySettings: Only an authorized account can call this function"
        );

        (address policy, bytes memory settingsData) = __decodeUpdatePolicySettingsArgs(_callArgs);
        IPolicy(policy).updateFundSettings(msg.sender, settingsData);
    }

    // PUBLIC FUNCTIONS

    /// @notice Get a list of enabled policies for a given fund
    /// @return enabledPolicies_ An array of enabled policy addresses
    function getPoliciesForFund(address _comptrollerProxy)
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
    function policyIsEnabledForFund(address _comptrollerProxy, address _policy)
        external
        view
        returns (bool)
    {
        return comptrollerProxyToPolicies[_comptrollerProxy].contains(_policy);
    }

    // PRIVATE FUNCTIONS

    function __decodeUpdatePolicySettingsArgs(bytes memory _callArgs)
        private
        pure
        returns (address policy_, bytes memory settingsData_)
    {
        return abi.decode(_callArgs, (address, bytes));
    }

    /// @notice Helper to validate policies
    function __validatePolicies(
        address _comptrollerProxy,
        PolicyHook _hook,
        PolicyHookExecutionTime _executionTime,
        bytes memory _validationData
    ) private {
        address[] memory policies = getPoliciesForFund(_comptrollerProxy);
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

    /// @notice Remove a policy from the list of registered policies
    /// @param _policy The address of the policy to remove
    function deregisterPolicy(address _policy) external onlyFundDeployerOwner {
        require(policyIsRegistered(_policy), "deregisterPolicy: _policy is not registered");

        registeredPolicies.remove(_policy);

        emit PolicyDeregistered(_policy, IPolicy(_policy).identifier());
    }

    /// @notice Add a policy to the Registry
    /// @param _policy Address of policy to be registered
    function registerPolicy(address _policy) external onlyFundDeployerOwner {
        require(!policyIsRegistered(_policy), "registerPolicy: _policy already registered");

        IPolicy policy = IPolicy(_policy);
        require(
            policy.policyHook() != PolicyHook.None,
            "registerPolicy: PolicyHook must be defined in the policy"
        );
        require(
            policy.policyHookExecutionTime() != PolicyHookExecutionTime.None,
            "registerPolicy: PolicyHookExecutionTime must be defined in the policy"
        );

        // Plugins should only have their latest version registered
        string memory identifier = policy.identifier();
        require(
            bytes(identifier).length != 0,
            "registerPolicy: Identifier must be defined in the policy"
        );

        registeredPolicies.add(_policy);

        emit PolicyRegistered(_policy, identifier);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Check whether a policy is registered
    /// @param _policy The address of the policy to check
    /// @return True if the policy is registered
    function policyIsRegistered(address _policy) public view returns (bool) {
        return registeredPolicies.contains(_policy);
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
}
