// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "../../../../core/fund/comptroller/ComptrollerLib.sol";
import "../../../../core/fund/vault/VaultLib.sol";
import "../utils/0.6.12/AddressListRegistryPerUserPolicyBase.sol";

/// @title AllowedAdaptersPerManagerPolicy Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A policy that limits which adapters an asset manager can use for a given fund
contract AllowedAdaptersPerManagerPolicy is AddressListRegistryPerUserPolicyBase {
    uint256 public constant BYPASS_FLAG = type(uint256).max;

    constructor(address _policyManager, address _addressListRegistry)
        public
        AddressListRegistryPerUserPolicyBase(_policyManager, _addressListRegistry)
    {}

    // EXTERNAL FUNCTIONS

    /// @notice Whether or not the policy can be disabled
    /// @return canDisable_ True if the policy can be disabled
    function canDisable() external pure virtual override returns (bool canDisable_) {
        return true;
    }

    /// @notice Provides a constant string identifier for a policy
    /// @return identifier_ The identifer string
    function identifier() external pure override returns (string memory identifier_) {
        return "ALLOWED_ADAPTERS_PER_MANAGER";
    }

    /// @notice Gets the implemented PolicyHooks for a policy
    /// @return implementedHooks_ The implemented PolicyHooks
    function implementedHooks() external pure override returns (IPolicyManager.PolicyHook[] memory implementedHooks_) {
        implementedHooks_ = new IPolicyManager.PolicyHook[](1);
        implementedHooks_[0] = IPolicyManager.PolicyHook.PostCallOnIntegration;

        return implementedHooks_;
    }

    /// @notice Updates the policy settings for a fund
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @param _encodedSettings Encoded settings to apply to a fund
    /// @dev Assigns a new array of lists (does not add/remove lists nor update items in a list)
    function updateFundSettings(address _comptrollerProxy, bytes calldata _encodedSettings)
        external
        override
        onlyPolicyManager
    {
        __updateListsForFund(_comptrollerProxy, _encodedSettings);
    }

    /// @notice Apply the rule with the specified parameters of a PolicyHook
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @param _encodedArgs Encoded args with which to validate the rule
    /// @return isValid_ True if the rule passes
    /// @dev onlyPolicyManager validation not necessary, as state is not updated and no events are fired
    function validateRule(address _comptrollerProxy, IPolicyManager.PolicyHook, bytes calldata _encodedArgs)
        external
        override
        returns (bool isValid_)
    {
        (address caller, address adapter,,,,,) = __decodePostCallOnIntegrationValidationData(_encodedArgs);

        return passesRule(_comptrollerProxy, caller, adapter);
    }

    // PUBLIC FUNCTIONS

    /// @notice Checks whether a particular condition passes the rule for a particular fund
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @param _caller The caller for which to check the rule
    /// @param _adapter The adapter for which to check the rule
    /// @return isValid_ True if the rule passes
    function passesRule(address _comptrollerProxy, address _caller, address _adapter)
        public
        view
        returns (bool isValid_)
    {
        if (_caller == VaultLib(payable(ComptrollerLib(_comptrollerProxy).getVaultProxy())).getOwner()) {
            // fund owner passes rule by default
            return true;
        }

        uint256[] memory listIds = getListIdsForFundAndUser(_comptrollerProxy, _caller);

        if (listIds.length == 0) {
            // A manager without any configured lists does not pass the rule
            return false;
        }

        if (listIds[0] == BYPASS_FLAG) {
            // The bypass flag is only accepted if in the first position in listIds
            return true;
        }

        return ADDRESS_LIST_REGISTRY_CONTRACT.isInSomeOfLists(listIds, _adapter);
    }
}
