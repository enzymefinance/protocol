// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "./PolicyBase.sol";

/// @title CallOnIntegrationPostValidatePolicyMixin Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice A mixin contract for policies implemented during post-validation of callOnIntegration
abstract contract CallOnIntegrationPostValidatePolicyBase is PolicyBase {
    /// @notice Get the PolicyHook for a policy
    /// @return The PolicyHook
    function policyHook() external view override returns (IPolicyManager.PolicyHook) {
        return IPolicyManager.PolicyHook.CallOnIntegration;
    }

    /// @notice Get the PolicyHookExecutionTime for a policy
    /// @return The PolicyHookExecutionTime
    function policyHookExecutionTime()
        external
        view
        override
        returns (IPolicyManager.PolicyHookExecutionTime)
    {
        return IPolicyManager.PolicyHookExecutionTime.Post;
    }

    /// @notice Helper to decode rule arguments
    function __decodeRuleArgs(bytes memory _encodedRuleArgs)
        internal
        pure
        returns (
            bytes4 selector_,
            address adapter_,
            address[] memory incomingAssets_,
            uint256[] memory incomingAmounts_,
            address[] memory outgoingAssets_,
            uint256[] memory outgoingAmounts_
        )
    {
        return abi.decode(
            _encodedRuleArgs,
            (
                bytes4,
                address,
                address[],
                uint256[],
                address[],
                uint256[]
            )
        );
    }
}
