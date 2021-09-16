// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "../utils/AddressListRegistryPolicyBase.sol";

/// @title AllowedAdaptersPolicy Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A policy that limits adapters that can be used by a fund
contract AllowedAdaptersPolicy is AddressListRegistryPolicyBase {
    constructor(address _policyManager, address _addressListRegistry)
        public
        AddressListRegistryPolicyBase(_policyManager, _addressListRegistry)
    {}

    // EXTERNAL FUNCTIONS

    /// @notice Provides a constant string identifier for a policy
    /// @return identifier_ The identifer string
    function identifier() external pure override returns (string memory identifier_) {
        return "ALLOWED_ADAPTERS";
    }

    /// @notice Gets the implemented PolicyHooks for a policy
    /// @return implementedHooks_ The implemented PolicyHooks
    function implementedHooks()
        external
        pure
        override
        returns (IPolicyManager.PolicyHook[] memory implementedHooks_)
    {
        implementedHooks_ = new IPolicyManager.PolicyHook[](1);
        implementedHooks_[0] = IPolicyManager.PolicyHook.PostCallOnIntegration;

        return implementedHooks_;
    }

    /// @notice Apply the rule with the specified parameters of a PolicyHook
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @param _encodedArgs Encoded args with which to validate the rule
    /// @return isValid_ True if the rule passes
    /// @dev onlyPolicyManager validation not necessary, as state is not updated and no events are fired
    function validateRule(
        address _comptrollerProxy,
        IPolicyManager.PolicyHook,
        bytes calldata _encodedArgs
    ) external override returns (bool isValid_) {
        (, address adapter, , , , , ) = __decodePostCallOnIntegrationValidationData(_encodedArgs);

        return passesRule(_comptrollerProxy, adapter);
    }

    // PUBLIC FUNCTIONS

    /// @notice Checks whether a particular condition passes the rule for a particular fund
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @param _adapter The adapter for which to check the rule
    /// @return isValid_ True if the rule passes
    function passesRule(address _comptrollerProxy, address _adapter)
        public
        view
        returns (bool isValid_)
    {
        return
            AddressListRegistry(getAddressListRegistry()).isInSomeOfLists(
                getListIdsForFund(_comptrollerProxy),
                _adapter
            );
    }
}
