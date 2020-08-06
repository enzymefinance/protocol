// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "../hub/Spoke.sol";
import "./IPolicy.sol";
import "./IPolicyManager.sol";

/// @title PolicyManager Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Manages policies by registering and validating policies
contract PolicyManager is IPolicyManager, Spoke {
    using EnumerableSet for EnumerableSet.AddressSet;

    event PolicyEnabled(address indexed policy, bytes encodedSettings);

    EnumerableSet.AddressSet private enabledPolicies;

    constructor (address _hub) public Spoke(_hub) {}

    /// @notice Enable policies for use in the fund
    /// @param _policies The policies to enable
    /// @param _encodedSettings The encoded settings with which a fund uses a policy
    function enablePolicies(address[] calldata _policies, bytes[] calldata _encodedSettings)
        external
        override
    {
        // Access
        require(
            msg.sender == __getHub().FUND_FACTORY(),
            "Only FundFactory can make this call"
        );
        // Sanity check
        require(_policies.length > 0, "enablePolicies: _policies cannot be empty");
        require(
            _policies.length == _encodedSettings.length,
            "enablePolicies: array lengths unequal"
        );

        // Enable each policy with settings
        IRegistry registry = __getRegistry();
        for (uint256 i = 0; i < _policies.length; i++) {
            IPolicy policy = IPolicy(_policies[i]);
            require(
                registry.policyIsRegistered(address(policy)),
                "enablePolicies: Policy is not on Registry"
            );
            require(
                !__policyIsEnabled(address(policy)),
                "enablePolicies: Policy is already enabled"
            );

            // Add policy
            EnumerableSet.add(enabledPolicies, address(policy));

            // Set fund config on policy
            policy.addFundSettings(_encodedSettings[i]);

            emit PolicyEnabled(address(policy), _encodedSettings[i]);
        }
    }

    function preValidatePolicy(PolicyHook _hook, bytes calldata _encodedArgs) external override {
        __validatePolicy(_hook, PolicyHookExecutionTime.Pre, _encodedArgs);
    }

    function postValidatePolicy(PolicyHook _hook, bytes calldata _encodedArgs) external override {
        __validatePolicy(_hook, PolicyHookExecutionTime.Post, _encodedArgs);
    }

    function updatePolicySettings(address _policy, bytes calldata _encodedSettings)
        external
        onlyManager
    {
        IPolicy(_policy).updateFundSettings(_encodedSettings);
    }

    // PUBLIC FUNCTIONS

    /// @notice Get a list of enabled policies
    /// @return An array of enabled policy addresses
    function getEnabledPolicies() public view returns (address[] memory) {
        uint256 length = enabledPolicies.length();
        address[] memory output_ = new address[](length);
        for (uint256 i = 0; i < length; i++){
            output_[i] = enabledPolicies.at(i);
        }
        return output_;
    }

    // PRIVATE FUNCTIONS

    /// @notice Check is a policy is enabled for the fund
    function __policyIsEnabled(address _policy) private view returns (bool) {
        return EnumerableSet.contains(enabledPolicies, _policy);
    }

    /// @notice Helper to validate policies
    function __validatePolicy(
        PolicyHook _hook,
        PolicyHookExecutionTime _executionTime,
        bytes memory _encodedArgs
    )
        private
    {
        address[] memory policies = getEnabledPolicies();
        for (uint i = 0; i < policies.length; i++) {
            if (
                IPolicy(policies[i]).policyHook() == _hook &&
                IPolicy(policies[i]).policyHookExecutionTime() == _executionTime
            ) {
                require(
                    IPolicy(policies[i]).validateRule(_encodedArgs),
                    string(abi.encodePacked(
                        "Rule evaluated to false: ",
                        IPolicy(policies[i]).identifier()
                    ))
                );
            }
        }
    }
}

contract PolicyManagerFactory {
    function createInstance(address _hub) external returns (address) {
        return address(new PolicyManager(_hub));
    }
}
