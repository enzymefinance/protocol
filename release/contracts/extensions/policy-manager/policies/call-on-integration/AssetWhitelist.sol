// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "../../../../core/fund/comptroller/ComptrollerLib.sol";
import "../../../../utils/AddressArrayLib.sol";
import "../utils/AddressListPolicyMixin.sol";
import "./utils/CallOnIntegrationPreValidatePolicyBase.sol";

/// @title AssetWhitelist Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice A whitelist of assets that cannot be added to a fund's vault
contract AssetWhitelist is CallOnIntegrationPreValidatePolicyBase, AddressListPolicyMixin {
    using AddressArrayLib for address[];

    constructor(address _policyManager) public PolicyBase(_policyManager) {}

    /// @notice Add the initial policy settings for a fund
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @param _encodedSettings Encoded settings to apply to a fund
    function addFundSettings(address _comptrollerProxy, bytes calldata _encodedSettings)
        external
        override
        onlyPolicyManager
    {
        address[] memory assets = abi.decode(_encodedSettings, (address[]));
        require(
            assets.contains(ComptrollerLib(_comptrollerProxy).getDenominationAsset()),
            "addFundSettings: must whitelist denominationAsset"
        );

        __addToList(_comptrollerProxy, abi.decode(_encodedSettings, (address[])));
    }

    /// @notice Provides a constant string identifier for a policy
    /// @return identifier_ The identifer string
    function identifier() external override pure returns (string memory identifier_) {
        return "ASSET_WHITELIST";
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
        (, , address[] memory incomingAssets, , , ) = __decodeRuleArgs(_encodedArgs);
        for (uint256 i = 0; i < incomingAssets.length; i++) {
            if (!isInList(_comptrollerProxy, incomingAssets[i])) return false;
        }

        return true;
    }
}
