// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {IAddressListRegistry} from "../../../persistent/address-list-registry/IAddressListRegistry.sol";

/// @title GSNRecipientMixin Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Mixin for contracts that will receive relayable calls via Gas Station Network
/// @dev Uses an AddressListRegistry list as a beacon for the trusted forwarder address
abstract contract GSNRecipientMixin {
    IAddressListRegistry internal immutable GSN_RECIPIENT_ADDRESS_LIST_REGISTRY;
    uint256 internal immutable GSN_RECIPIENT_TRUSTED_FORWARDERS_LIST_ID;

    constructor(address _addressListRegistry, uint256 _trustedForwardersAddressListId) {
        GSN_RECIPIENT_ADDRESS_LIST_REGISTRY = IAddressListRegistry(_addressListRegistry);
        GSN_RECIPIENT_TRUSTED_FORWARDERS_LIST_ID = _trustedForwardersAddressListId;
    }

    /// @dev Helper to check whether an address is a known GSN trusted forwarder
    function __isGSNTrustedForwarder(address _who) internal view returns (bool isTrustedForwarder_) {
        return
            GSN_RECIPIENT_ADDRESS_LIST_REGISTRY.isInList({_id: GSN_RECIPIENT_TRUSTED_FORWARDERS_LIST_ID, _item: _who});
    }

    /// @dev Helper to parse the canonical msg sender from trusted forwarder relayed calls
    /// See https://github.com/opengsn/gsn/blob/da4222b76e3ae1968608dc5c5d80074dcac7c4be/packages/contracts/src/ERC2771Recipient.sol#L41-L53
    function __msgSender() internal view returns (address canonicalSender_) {
        if (msg.data.length >= 20 && __isGSNTrustedForwarder(msg.sender)) {
            assembly {
                canonicalSender_ := shr(96, calldataload(sub(calldatasize(), 20)))
            }

            return canonicalSender_;
        }

        return msg.sender;
    }
}
