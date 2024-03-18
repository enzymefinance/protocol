// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

import {GSNRecipientMixin} from "../utils/0.8.19/gas-station-network/GSNRecipientMixin.sol";

/// @title GSNRecipientMixinHarness Contract
/// @author Enzyme Council <security@enzyme.finance>
contract GSNRecipientMixinHarness is GSNRecipientMixin {
    constructor(address _addressListRegistry, uint256 _trustedForwardersAddressListId)
        GSNRecipientMixin(_addressListRegistry, _trustedForwardersAddressListId)
    {}

    function exposed_isGSNTrustedForwarder(address _who) external view returns (bool isTrustedForwarder_) {
        return __isGSNTrustedForwarder(_who);
    }

    function exposed_msgSender() external view returns (address canonicalSender_) {
        return __msgSender();
    }
}
