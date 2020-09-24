// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../utils/AddressListPolicyMixin.sol";
import "./utils/BuySharesPreValidatePolicyBase.sol";

/// @title UserWhitelist Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice A whitelist of users who can buy shares in a fund
contract UserWhitelist is BuySharesPreValidatePolicyBase, AddressListPolicyMixin {
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
        return "USER_WHITELIST";
    }

    /// @notice Update the policy settings for a fund
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @param _encodedSettings Encoded settings to apply to a fund
    /// @dev A fund's PolicyManager is always the sender
    function updateFundSettings(address _comptrollerProxy, bytes calldata _encodedSettings)
        external
        override
        onlyPolicyManager
    {
        (address[] memory itemsToAdd, address[] memory itemsToRemove) = abi.decode(
            _encodedSettings,
            (address[], address[])
        );
        require(
            itemsToAdd.length > 0 || itemsToRemove.length > 0,
            "updateFundSettings: must pass addresses to add or remove"
        );

        // If an address is in both add and remove arrays, they will not be in the final list.
        // We do not check for uniqueness between the two arrays for efficiency.
        if (itemsToAdd.length > 0) {
            __addToList(_comptrollerProxy, itemsToAdd);
        }
        if (itemsToRemove.length > 0) {
            __removeFromList(_comptrollerProxy, itemsToRemove);
        }
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
        (address buyer, , ) = __decodeRuleArgs(_encodedArgs);
        return isInList(_comptrollerProxy, buyer);
    }
}
