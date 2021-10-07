// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "../../core/fund/vault/IVault.sol";
import "../../infrastructure/gas-relayer/GasRelayRecipientMixin.sol";
import "../../utils/AddressArrayLib.sol";
import "../../utils/FundDeployerOwnerMixin.sol";
import "../utils/ExtensionBase.sol";
import "./IPolicy.sol";
import "./IPolicyManager.sol";

/// @title PolicyManager Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Manages policies for funds
/// @dev Any arbitrary fee is allowed by default, so all participants must be aware of
/// their fund's configuration, especially whether they use official policies only.
/// Policies that restrict current investors can only be added upon fund setup, migration, or reconfiguration.
/// Policies that restrict new investors or asset management actions can be added at any time.
/// Policies themselves specify whether or not they are allowed to be updated or removed.
contract PolicyManager is
    IPolicyManager,
    ExtensionBase,
    FundDeployerOwnerMixin,
    GasRelayRecipientMixin
{
    using AddressArrayLib for address[];

    event PolicyDisabledOnHookForFund(
        address indexed comptrollerProxy,
        address indexed policy,
        PolicyHook indexed hook
    );

    event PolicyEnabledForFund(
        address indexed comptrollerProxy,
        address indexed policy,
        bytes settingsData
    );

    mapping(address => mapping(PolicyHook => address[])) private comptrollerProxyToHookToPolicies;

    modifier onlyFundOwner(address _comptrollerProxy) {
        require(
            __msgSender() == IVault(IComptroller(_comptrollerProxy).getVaultProxy()).getOwner(),
            "Only the fund owner can call this function"
        );
        _;
    }

    constructor(address _fundDeployer, address _gasRelayPaymasterFactory)
        public
        FundDeployerOwnerMixin(_fundDeployer)
        GasRelayRecipientMixin(_gasRelayPaymasterFactory)
    {}

    // EXTERNAL FUNCTIONS

    /// @notice Validates and initializes policies as necessary prior to fund activation
    /// @param _isMigratedFund True if the fund is migrating to this release
    /// @dev Caller is expected to be a valid ComptrollerProxy, but there isn't a need to validate.
    function activateForFund(bool _isMigratedFund) external override {
        // Policies must assert that they are congruent with migrated vault state
        if (_isMigratedFund) {
            address[] memory enabledPolicies = getEnabledPoliciesForFund(msg.sender);
            for (uint256 i; i < enabledPolicies.length; i++) {
                __activatePolicyForFund(msg.sender, enabledPolicies[i]);
            }
        }
    }

    /// @notice Disables a policy for a fund
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _policy The policy address to disable
    /// @dev If an arbitrary policy changes its `implementedHooks()` return values after it is
    /// already enabled on a fund, then this will not correctly disable the policy from any
    /// removed hook values
    function disablePolicyForFund(address _comptrollerProxy, address _policy)
        external
        onlyFundOwner(_comptrollerProxy)
    {
        require(IPolicy(_policy).canDisable(), "disablePolicyForFund: _policy cannot be disabled");

        PolicyHook[] memory implementedHooks = IPolicy(_policy).implementedHooks();
        for (uint256 i; i < implementedHooks.length; i++) {

                bool disabled
             = comptrollerProxyToHookToPolicies[_comptrollerProxy][implementedHooks[i]]
                .removeStorageItem(_policy);
            if (disabled) {
                emit PolicyDisabledOnHookForFund(_comptrollerProxy, _policy, implementedHooks[i]);
            }
        }
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
    ) external onlyFundOwner(_comptrollerProxy) {
        PolicyHook[] memory implementedHooks = IPolicy(_policy).implementedHooks();
        for (uint256 i; i < implementedHooks.length; i++) {
            require(
                !__policyHookRestrictsCurrentInvestorActions(implementedHooks[i]),
                "enablePolicyForFund: _policy restricts actions of current investors"
            );
        }

        __enablePolicyForFund(_comptrollerProxy, _policy, _settingsData, implementedHooks);

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
        for (uint256 i; i < policies.length; i++) {
            __enablePolicyForFund(
                msg.sender,
                policies[i],
                settingsData[i],
                IPolicy(policies[i]).implementedHooks()
            );
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
        IPolicy(_policy).updateFundSettings(_comptrollerProxy, _settingsData);
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
        // Return as quickly as possible if no policies to run
        address[] memory policies = getEnabledPoliciesOnHookForFund(_comptrollerProxy, _hook);
        if (policies.length == 0) {
            return;
        }

        // Limit calls to trusted components, in case policies update local storage upon runs
        require(
            msg.sender == _comptrollerProxy ||
                msg.sender == IComptroller(_comptrollerProxy).getIntegrationManager() ||
                msg.sender == IComptroller(_comptrollerProxy).getExternalPositionManager(),
            "validatePolicies: Caller not allowed"
        );

        for (uint256 i; i < policies.length; i++) {
            require(
                IPolicy(policies[i]).validateRule(_comptrollerProxy, _hook, _validationData),
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
    function __activatePolicyForFund(address _comptrollerProxy, address _policy) private {
        IPolicy(_policy).activateForFund(_comptrollerProxy);
    }

    /// @dev Helper to set config and enable policies for a fund
    function __enablePolicyForFund(
        address _comptrollerProxy,
        address _policy,
        bytes memory _settingsData,
        PolicyHook[] memory _hooks
    ) private {
        // Set fund config on policy
        if (_settingsData.length > 0) {
            IPolicy(_policy).addFundSettings(_comptrollerProxy, _settingsData);
        }

        // Add policy
        for (uint256 i; i < _hooks.length; i++) {
            require(
                !policyIsEnabledOnHookForFund(_comptrollerProxy, _hooks[i], _policy),
                "__enablePolicyForFund: Policy is already enabled"
            );
            comptrollerProxyToHookToPolicies[_comptrollerProxy][_hooks[i]].push(_policy);
        }

        emit PolicyEnabledForFund(_comptrollerProxy, _policy, _settingsData);
    }

    /// @dev Helper to get all the hooks available to policies
    function __getAllPolicyHooks() private pure returns (PolicyHook[10] memory hooks_) {
        return [
            PolicyHook.PostBuyShares,
            PolicyHook.PostCallOnIntegration,
            PolicyHook.PreTransferShares,
            PolicyHook.RedeemSharesForSpecificAssets,
            PolicyHook.AddTrackedAssets,
            PolicyHook.RemoveTrackedAssets,
            PolicyHook.CreateExternalPosition,
            PolicyHook.PostCallOnExternalPosition,
            PolicyHook.RemoveExternalPosition,
            PolicyHook.ReactivateExternalPosition
        ];
    }

    /// @dev Helper to check if a policy hook restricts the actions of current investors.
    /// These hooks should not allow policy additions post-deployment or post-migration.
    function __policyHookRestrictsCurrentInvestorActions(PolicyHook _hook)
        private
        pure
        returns (bool restrictsActions_)
    {
        return
            _hook == PolicyHook.PreTransferShares ||
            _hook == PolicyHook.RedeemSharesForSpecificAssets;
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Get a list of enabled policies for the given fund
    /// @param _comptrollerProxy The ComptrollerProxy
    /// @return enabledPolicies_ The array of enabled policy addresses
    function getEnabledPoliciesForFund(address _comptrollerProxy)
        public
        view
        returns (address[] memory enabledPolicies_)
    {
        PolicyHook[10] memory hooks = __getAllPolicyHooks();

        for (uint256 i; i < hooks.length; i++) {
            enabledPolicies_ = enabledPolicies_.mergeArray(
                getEnabledPoliciesOnHookForFund(_comptrollerProxy, hooks[i])
            );
        }

        return enabledPolicies_;
    }

    /// @notice Get a list of enabled policies that run on a given hook for the given fund
    /// @param _comptrollerProxy The ComptrollerProxy
    /// @param _hook The PolicyHook
    /// @return enabledPolicies_ The array of enabled policy addresses
    function getEnabledPoliciesOnHookForFund(address _comptrollerProxy, PolicyHook _hook)
        public
        view
        returns (address[] memory enabledPolicies_)
    {
        return comptrollerProxyToHookToPolicies[_comptrollerProxy][_hook];
    }

    /// @notice Check whether a given policy runs on a given hook for a given fund
    /// @param _comptrollerProxy The ComptrollerProxy
    /// @param _hook The PolicyHook
    /// @param _policy The policy
    /// @return isEnabled_ True if the policy is enabled
    function policyIsEnabledOnHookForFund(
        address _comptrollerProxy,
        PolicyHook _hook,
        address _policy
    ) public view returns (bool isEnabled_) {
        return getEnabledPoliciesOnHookForFund(_comptrollerProxy, _hook).contains(_policy);
    }
}
