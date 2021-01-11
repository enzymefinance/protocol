// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../../core/fund/comptroller/ComptrollerLib.sol";
import "../../../../core/fund/vault/VaultLib.sol";
import "../../../../utils/AddressArrayLib.sol";
import "../utils/AddressListPolicyMixin.sol";
import "./utils/PostCallOnIntegrationValidatePolicyBase.sol";

/// @title AssetWhitelist Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A policy that only allows a configurable whitelist of assets in a fund's holdings
contract AssetWhitelist is PostCallOnIntegrationValidatePolicyBase, AddressListPolicyMixin {
    using AddressArrayLib for address[];

    constructor(address _policyManager) public PolicyBase(_policyManager) {}

    /// @notice Validates and initializes a policy as necessary prior to fund activation
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @param _vaultProxy The fund's VaultProxy address
    function activateForFund(address _comptrollerProxy, address _vaultProxy)
        external
        override
        onlyPolicyManager
    {
        require(
            passesRule(_comptrollerProxy, VaultLib(_vaultProxy).getTrackedAssets()),
            "activateForFund: Non-whitelisted asset detected"
        );
    }

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
            "addFundSettings: Must whitelist denominationAsset"
        );

        __addToList(_comptrollerProxy, abi.decode(_encodedSettings, (address[])));
    }

    /// @notice Provides a constant string identifier for a policy
    /// @return identifier_ The identifer string
    function identifier() external pure override returns (string memory identifier_) {
        return "ASSET_WHITELIST";
    }

    /// @notice Checks whether a particular condition passes the rule for a particular fund
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @param _assets The assets with which to check the rule
    /// @return isValid_ True if the rule passes
    function passesRule(address _comptrollerProxy, address[] memory _assets)
        public
        view
        returns (bool isValid_)
    {
        for (uint256 i; i < _assets.length; i++) {
            if (!isInList(_comptrollerProxy, _assets[i])) {
                return false;
            }
        }

        return true;
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
        (, , address[] memory incomingAssets, , , ) = __decodeRuleArgs(_encodedArgs);

        return passesRule(_comptrollerProxy, incomingAssets);
    }
}
