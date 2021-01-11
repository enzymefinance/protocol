// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../utils/PolicyBase.sol";

/// @title BuySharesSetupPolicyBase Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A mixin contract for policies that only implement the BuySharesSetup policy hook
abstract contract BuySharesSetupPolicyBase is PolicyBase {
    /// @notice Gets the implemented PolicyHooks for a policy
    /// @return implementedHooks_ The implemented PolicyHooks
    function implementedHooks()
        external
        view
        override
        returns (IPolicyManager.PolicyHook[] memory implementedHooks_)
    {
        implementedHooks_ = new IPolicyManager.PolicyHook[](1);
        implementedHooks_[0] = IPolicyManager.PolicyHook.BuySharesSetup;

        return implementedHooks_;
    }

    /// @notice Helper to decode rule arguments
    function __decodeRuleArgs(bytes memory _encodedArgs)
        internal
        pure
        returns (
            address caller_,
            uint256[] memory investmentAmounts_,
            uint256 gav_
        )
    {
        return abi.decode(_encodedArgs, (address, uint256[], uint256));
    }
}
