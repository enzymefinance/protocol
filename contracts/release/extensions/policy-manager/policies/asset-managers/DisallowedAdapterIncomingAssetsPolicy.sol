// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {IAddressListRegistry} from "../../../../../persistent/address-list-registry/IAddressListRegistry.sol";
import {IPolicyManager} from "../../IPolicyManager.sol";
import {AddressListRegistryPolicyBase} from "../utils/0.8.19/AddressListRegistryPolicyBase.sol";

/// @title DisallowedAdapterIncomingAssetsPolicy Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice A policy that disallows assets that can be received via an adapter action
contract DisallowedAdapterIncomingAssetsPolicy is AddressListRegistryPolicyBase {
    constructor(address _policyManager, address _addressListRegistry)
        AddressListRegistryPolicyBase(_policyManager, _addressListRegistry)
    {}

    // EXTERNAL FUNCTIONS

    /// @notice Provides a constant string identifier for a policy
    /// @return identifier_ The identifier string
    function identifier() external pure override returns (string memory identifier_) {
        return "DISALLOWED_ADAPTER_INCOMING_ASSETS";
    }

    /// @notice Gets the implemented PolicyHooks for a policy
    /// @return implementedHooks_ The implemented PolicyHooks
    function implementedHooks() external pure override returns (IPolicyManager.PolicyHook[] memory implementedHooks_) {
        implementedHooks_ = new IPolicyManager.PolicyHook[](1);
        implementedHooks_[0] = IPolicyManager.PolicyHook.PostCallOnIntegration;

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
        (,,, address[] memory incomingAssets,,,) = __decodePostCallOnIntegrationValidationData(_encodedArgs);

        return passesRule(_comptrollerProxy, incomingAssets);
    }

    // PUBLIC FUNCTIONS

    /// @notice Checks whether a particular condition passes the rule for a particular fund
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @param _assets The assets for which to check the rule
    /// @return isValid_ True if the rule passes
    function passesRule(address _comptrollerProxy, address[] memory _assets) public view returns (bool isValid_) {
        return IAddressListRegistry(getAddressListRegistry())
            .areAllNotInAnyOfLists(getListIdsForFund(_comptrollerProxy), _assets);
    }
}
