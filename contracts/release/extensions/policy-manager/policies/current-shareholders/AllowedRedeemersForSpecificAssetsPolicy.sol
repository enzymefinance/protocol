// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {IAddressListRegistry} from "../../../../../persistent/address-list-registry/IAddressListRegistry.sol";
import {IPolicyManager} from "../../IPolicyManager.sol";
import {AddressListRegistryPolicyBase} from "../utils/0.8.19/AddressListRegistryPolicyBase.sol";

/// @title AllowedRedeemersForSpecificAssetsPolicy Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A policy that limits users who can redeem shares for specific assets
contract AllowedRedeemersForSpecificAssetsPolicy is AddressListRegistryPolicyBase {
    constructor(address _policyManager, address _addressListRegistry)
        AddressListRegistryPolicyBase(_policyManager, _addressListRegistry)
    {}

    // EXTERNAL FUNCTIONS

    /// @notice Whether or not the policy can be disabled
    /// @return canDisable_ True if the policy can be disabled
    function canDisable() external pure virtual override returns (bool canDisable_) {
        return true;
    }

    /// @notice Provides a constant string identifier for a policy
    /// @return identifier_ The identifier string
    function identifier() external pure override returns (string memory identifier_) {
        return "ALLOWED_REDEEMERS_FOR_SPECIFIC_ASSETS";
    }

    /// @notice Gets the implemented PolicyHooks for a policy
    /// @return implementedHooks_ The implemented PolicyHooks
    function implementedHooks() external pure override returns (IPolicyManager.PolicyHook[] memory implementedHooks_) {
        implementedHooks_ = new IPolicyManager.PolicyHook[](1);
        implementedHooks_[0] = IPolicyManager.PolicyHook.RedeemSharesForSpecificAssets;

        return implementedHooks_;
    }

    /// @notice Apply the rule with the specified parameters of a PolicyHook
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @param _encodedArgs Encoded args with which to validate the rule
    /// @return isValid_ True if the rule passes
    /// @dev onlyPolicyManager validation not necessary, as state is not updated and no events are fired
    function validateRule(address _comptrollerProxy, IPolicyManager.PolicyHook, bytes calldata _encodedArgs)
        external
        view
        override
        returns (bool isValid_)
    {
        (address redeemer,,,,,) = __decodeRedeemSharesForSpecificAssetsValidationData(_encodedArgs);

        return IAddressListRegistry(getAddressListRegistry()).isInSomeOfLists({
            _ids: getListIdsForFund(_comptrollerProxy),
            _item: redeemer
        });
    }
}
