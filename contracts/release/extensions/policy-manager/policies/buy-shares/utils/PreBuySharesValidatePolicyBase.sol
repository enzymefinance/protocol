// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;

import "../../utils/PolicyBase.sol";

/// @title BuySharesPolicyMixin Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice A mixin contract for policies that only implement the PreBuyShares policy hook
abstract contract PreBuySharesValidatePolicyBase is PolicyBase {
    /// @notice Gets the implemented PolicyHooks for a policy
    /// @return implementedHooks_ The implemented PolicyHooks
    function implementedHooks()
        external
        view
        override
        returns (IPolicyManager.PolicyHook[] memory implementedHooks_)
    {
        implementedHooks_ = new IPolicyManager.PolicyHook[](1);
        implementedHooks_[0] = IPolicyManager.PolicyHook.PreBuyShares;

        return implementedHooks_;
    }

    /// @notice Helper to decode rule arguments
    function __decodeRuleArgs(bytes memory _encodedArgs)
        internal
        pure
        returns (
            address buyer_,
            uint256 investmentAmount_,
            uint256 minSharesQuantity_,
            uint256 gav_
        )
    {
        return abi.decode(_encodedArgs, (address, uint256, uint256, uint256));
    }
}
