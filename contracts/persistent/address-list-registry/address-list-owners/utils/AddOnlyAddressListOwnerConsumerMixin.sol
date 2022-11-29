// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../AddressListRegistry.sol";
import "./AddOnlyAddressListOwnerBase.sol";

/// @title AddOnlyAddressListOwnerConsumerMixin Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Mixin contract for interacting with a contract that inherits `AddOnlyAddressListOwnerBase`
abstract contract AddOnlyAddressListOwnerConsumerMixin {
    AddressListRegistry internal immutable ADDRESS_LIST_REGISTRY_CONTRACT;
    uint256 internal immutable LIST_ID;
    AddOnlyAddressListOwnerBase internal immutable LIST_OWNER_CONTRACT;

    constructor(address _addressListRegistry, uint256 _listId) public {
        ADDRESS_LIST_REGISTRY_CONTRACT = AddressListRegistry(_addressListRegistry);
        LIST_ID = _listId;

        address listOwner = AddressListRegistry(_addressListRegistry).getListOwner(_listId);
        LIST_OWNER_CONTRACT = AddOnlyAddressListOwnerBase(listOwner);
    }

    /// @dev Helper to lookup an item's existence and then attempt to add it.
    /// AddOnlyAddressListOwnerBase.addValidatedItemsToList() performs validation on the item
    /// via the __validateItems() implementation of its inheriting contract.
    function __validateAndAddListItemIfUnregistered(address _item) internal {
        if (!ADDRESS_LIST_REGISTRY_CONTRACT.isInList(LIST_ID, _item)) {
            address[] memory items = new address[](1);
            items[0] = _item;

            LIST_OWNER_CONTRACT.addValidatedItemsToList(items);
        }
    }
}
