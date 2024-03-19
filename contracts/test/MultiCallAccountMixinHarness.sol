// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.19;

import {MultiCallAccountMixin} from "../persistent/smart-accounts/utils/MultiCallAccountMixin.sol";

/// @title MultiCallAccountMixinHarness Contract
/// @author Enzyme Council <security@enzyme.finance>
contract MultiCallAccountMixinHarness is MultiCallAccountMixin {
    constructor(address _addressListRegistry, uint256 _gsnTrustedForwardersAddressListId)
        MultiCallAccountMixin(_addressListRegistry, _gsnTrustedForwardersAddressListId)
    {}

    function exposed_setOwner(address _nextOwner) external {
        __setOwner(_nextOwner);
    }
}
