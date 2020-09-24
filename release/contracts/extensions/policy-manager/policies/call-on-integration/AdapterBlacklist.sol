// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../utils/AddressListPolicyMixin.sol";
import "./utils/CallOnIntegrationPreValidatePolicyBase.sol";

/// @title AdapterBlacklist Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice A blacklist of adapters to add to a fund's vault
contract AdapterBlacklist is CallOnIntegrationPreValidatePolicyBase, AddressListPolicyMixin {
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
    function identifier() external override pure returns (string memory identifier_) {
        return "ADAPTER_BLACKLIST";
    }

    /// @notice Apply the rule with specified parameters, in the context of a fund
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @param _encodedArgs Encoded args with which to validate the rule
    /// @return isValid_ True if the rule passes
    function validateRule(address _comptrollerProxy, bytes calldata _encodedArgs)
        external
        override
        returns (bool isValid_)
    {
        (, address adapter, , , , ) = __decodeRuleArgs(_encodedArgs);
        if (!isInList(_comptrollerProxy, adapter)) {
            return true;
        }

        return false;
    }
}
