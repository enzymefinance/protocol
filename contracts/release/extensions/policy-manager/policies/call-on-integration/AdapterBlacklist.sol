// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../utils/AddressListPolicyMixin.sol";
import "./utils/PreCallOnIntegrationValidatePolicyBase.sol";

/// @title AdapterBlacklist Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A policy that disallows a configurable blacklist of adapters from use by a fund
contract AdapterBlacklist is PreCallOnIntegrationValidatePolicyBase, AddressListPolicyMixin {
    constructor(address _policyManager) public PolicyBase(_policyManager) {}

    /// @notice Add the initial policy settings for a fund
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @param _encodedSettings Encoded settings to apply to a fund
    function addFundSettings(address _comptrollerProxy, bytes calldata _encodedSettings)
        external
        override
        onlyPolicyManager
    {
        __addToList(_comptrollerProxy, abi.decode(_encodedSettings, (address[])));
    }

    /// @notice Provides a constant string identifier for a policy
    /// @return identifier_ The identifer string
    function identifier() external pure override returns (string memory identifier_) {
        return "ADAPTER_BLACKLIST";
    }

    /// @notice Checks whether a particular condition passes the rule for a particular fund
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @param _adapter The adapter with which to check the rule
    /// @return isValid_ True if the rule passes
    function passesRule(address _comptrollerProxy, address _adapter)
        public
        view
        returns (bool isValid_)
    {
        return !isInList(_comptrollerProxy, _adapter);
    }

    /// @notice Apply the rule with the specified parameters of a PolicyHook
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @param _encodedArgs Encoded args with which to validate the rule
    /// @return isValid_ True if the rule passes
    function validateRule(
        address _comptrollerProxy,
        address,
        IPolicyManager.PolicyHook,
        bytes calldata _encodedArgs
    ) external override returns (bool isValid_) {
        (address adapter, ) = __decodeRuleArgs(_encodedArgs);

        return passesRule(_comptrollerProxy, adapter);
    }
}
