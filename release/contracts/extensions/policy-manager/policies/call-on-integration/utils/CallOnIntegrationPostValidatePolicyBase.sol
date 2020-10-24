// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../../utils/PolicyBase.sol";

/// @title CallOnIntegrationPostValidatePolicyMixin Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice A mixin contract for policies implemented during post-validation of callOnIntegration
abstract contract CallOnIntegrationPostValidatePolicyBase is PolicyBase {
    /// @notice Gets the implemented PolicyHooks for a policy
    /// @return implementedHooks_ The implemented PolicyHooks
    function implementedHooks()
        external
        view
        override
        returns (IPolicyManager.PolicyHook[] memory implementedHooks_)
    {
        implementedHooks_ = new IPolicyManager.PolicyHook[](1);
        implementedHooks_[0] = IPolicyManager.PolicyHook.PostCallOnIntegration;

        return implementedHooks_;
    }

    /// @notice Helper to decode rule arguments
    function __decodeRuleArgs(bytes memory _encodedRuleArgs)
        internal
        pure
        returns (
            address adapter_,
            bytes4 selector_,
            address[] memory incomingAssets_,
            uint256[] memory incomingAssetAmounts_,
            address[] memory outgoingAssets_,
            uint256[] memory outgoingAssetAmounts_
        )
    {
        return
            abi.decode(
                _encodedRuleArgs,
                (address, bytes4, address[], uint256[], address[], uint256[])
            );
    }
}
