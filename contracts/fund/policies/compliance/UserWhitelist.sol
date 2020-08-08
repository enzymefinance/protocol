// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../utils/BuySharesPreValidatePolicyBase.sol";
import "../utils/AddressListPolicyMixin.sol";

/// @title UserWhitelist Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Investors can be added and removed from whitelist
contract UserWhitelist is BuySharesPreValidatePolicyBase, AddressListPolicyMixin {
    constructor(address _registry) public PolicyBase(_registry) {}

    /// @notice Add the initial policy settings for a fund
    /// @param _encodedSettings Encoded settings to apply to a fund
    /// @dev A fund's PolicyManager is always the sender
    /// @dev Only called once, on PolicyManager.enablePolicies()
    function addFundSettings(bytes calldata _encodedSettings) external override onlyPolicyManager {
        __addToList(abi.decode(_encodedSettings, (address[])));
    }

    /// @notice Provides a constant string identifier for a policy
    function identifier() external override pure returns (string memory) {
        return "USER_WHITELIST";
    }

    /// @notice Update the policy settings for a fund
    /// @param _encodedSettings Encoded settings to apply to a fund
    /// @dev A fund's PolicyManager is always the sender
    function updateFundSettings(bytes calldata _encodedSettings)
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

        if (itemsToAdd.length > 0) __addToList(itemsToAdd);
        if (itemsToRemove.length > 0) __removeFromList(itemsToRemove);
    }

    /// @notice Apply the rule with specified paramters, in the context of a fund
    /// @param _encodedArgs Encoded args with which to validate the rule
    /// @return True if the rule passes
    /// @dev A fund's PolicyManager is always the sender
    function validateRule(bytes calldata _encodedArgs)
        external
        override
        onlyPolicyManager
        returns (bool)
    {
        (address buyer, , ) = __decodeRuleArgs(_encodedArgs);
        return isInList(msg.sender, buyer);
    }
}
