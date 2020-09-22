// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "./PolicyBase.sol";

/// @title CallOnIntegrationPreValidatePolicyMixin Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice A mixin contract for policies implemented during pre-validation of callOnIntegration
abstract contract CallOnIntegrationPreValidatePolicyBase is PolicyBase {
    /// @notice Get the PolicyHook for a policy
    /// @return The PolicyHook
    function policyHook() external override view returns (IPolicyManager.PolicyHook) {
        return IPolicyManager.PolicyHook.CallOnIntegration;
    }

    /// @notice Get the PolicyHookExecutionTime for a policy
    /// @return The PolicyHookExecutionTime
    function policyHookExecutionTime()
        external
        override
        view
        returns (IPolicyManager.PolicyHookExecutionTime)
    {
        return IPolicyManager.PolicyHookExecutionTime.Pre;
    }

    /// @notice Helper to decode rule arguments
    function __decodeRuleArgs(bytes memory _encodedRuleArgs)
        internal
        pure
        returns (
            bytes4 selector_,
            address adapter_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_
        )
    {
        return
            abi.decode(
                _encodedRuleArgs,
                (bytes4, address, address[], uint256[], address[], uint256[])
            );
    }
}
