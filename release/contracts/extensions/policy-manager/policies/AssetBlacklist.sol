// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "./utils/CallOnIntegrationPreValidatePolicyBase.sol";
import "./utils/AddressListPolicyMixin.sol";

/// @title AssetBlacklist Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice A blacklist of assets that cannot be added to a fund's vault
contract AssetBlacklist is CallOnIntegrationPreValidatePolicyBase, AddressListPolicyMixin {
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
    function identifier() external override pure returns (string memory) {
        return "ASSET_BLACKLIST";
    }

    /// @notice Apply the rule with specified parameters, in the context of a fund
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @param _encodedArgs Encoded args with which to validate the rule
    /// @return True if the rule passes
    function validateRule(address _comptrollerProxy, bytes calldata _encodedArgs)
        external
        override
        view
        returns (bool)
    {
        (, , address[] memory incomingAssets, , , ) = __decodeRuleArgs(_encodedArgs);
        for (uint256 i = 0; i < incomingAssets.length; i++) {
            if (isInList(_comptrollerProxy, incomingAssets[i])) return false;
        }

        return true;
    }
}
