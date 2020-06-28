// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../utils/CallOnIntegrationPreValidatePolicyBase.sol";
import "../utils/AddressListPolicyMixin.sol";

/// @title AssetBlacklist Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice A blacklist of assets to add to a fund's vault
/// @dev Assets can be added but not removed from blacklist
contract AssetBlacklist is CallOnIntegrationPreValidatePolicyBase, AddressListPolicyMixin {
    constructor(address _registry) public PolicyBase(_registry) {}

    /// @notice Add the initial policy settings for a fund
    /// @param _encodedSettings Encoded settings to apply to a fund
    /// @dev A fund's PolicyManager is always the sender
    /// @dev Only called once, on PolicyManager.enablePolicies()
    function addFundSettings(bytes calldata _encodedSettings) external override onlyPolicyManager {
        __addToList(abi.decode(_encodedSettings, (address[])));
    }

    /// @notice Provides a constant string identifier for a policy
    function identifier() external pure override returns (string memory) {
        return "ASSET_BLACKLIST";
    }

    /// @notice Apply the rule with specified parameters, in the context of a fund
    /// @param _encodedArgs Encoded args with which to validate the rule
    /// @return True if the rule passes
    /// @dev A fund's PolicyManager is always the sender
    function validateRule(bytes calldata _encodedArgs)
        external
        override
        onlyPolicyManager
        returns (bool)
    {
        (,,address[] memory incomingAssets,,,) = __decodeRuleArgs(_encodedArgs);
        for (uint256 i = 0; i < incomingAssets.length; i++) {
            if (isInList(msg.sender, incomingAssets[i])) return false;
        }

        return true;
    }
}
