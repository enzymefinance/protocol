pragma solidity 0.6.8;

import "./PolicyBase.sol";

/// @title CallOnIntegrationPreValidatePolicyMixin Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice A mixin contract for policies implemented during pre-validation of callOnIntegration
abstract contract CallOnIntegrationPreValidatePolicyBase is PolicyBase {
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
        return IPolicyManager.PolicyHookExecutionTime.Pre;
    }

    /// @notice Helper to decode rule arguments
    function __decodeRuleArgs(bytes memory _encodedRuleArgs)
        internal
        pure
        returns (bytes4 selector, address adapter)
    {
        return abi.decode(_encodedRuleArgs, (bytes4,address));
    }
}
