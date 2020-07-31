// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "./PolicyBase.sol";

/// @title BuySharesPolicyMixin Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice A mixin contract for policies implemented while buying shares
abstract contract BuySharesPreValidatePolicyBase is PolicyBase {
    /// @notice Get the PolicyHook for a policy
    /// @return The PolicyHook
    function policyHook() external view override returns (IPolicyManager.PolicyHook) {
        return IPolicyManager.PolicyHook.BuyShares;
    }

    /// @notice Get the PolicyHookExecutionTime for a policy
    /// @return The PolicyHookExecutionTime
    function policyHookExecutionTime() external view override returns (IPolicyManager.PolicyHookExecutionTime) {
        return IPolicyManager.PolicyHookExecutionTime.Pre;
    }

    /// @notice Helper to decode rule arguments
    function __decodeRuleArgs(bytes memory _encodedArgs)
        internal
        pure
        returns (
            address buyer_,
            uint256 investmentAmount_,
            uint256 minSharesQuantity_
        )
    {
        return abi.decode(
            _encodedArgs,
            (
                address,
                uint256,
                uint256
            )
        );
    }
}
