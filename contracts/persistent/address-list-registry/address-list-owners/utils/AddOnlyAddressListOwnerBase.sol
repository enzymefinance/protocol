// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "../../IAddressListRegistry.sol";

/// @title AddOnlyAddressListOwnerBase Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Base contract for an owner of an AddressListRegistry list that is add-only
abstract contract AddOnlyAddressListOwnerBase {
    IAddressListRegistry internal immutable ADDRESS_LIST_REGISTRY_CONTRACT;
    uint256 internal immutable LIST_ID;

    constructor(address _addressListRegistry, string memory _listDescription) public {
        ADDRESS_LIST_REGISTRY_CONTRACT = IAddressListRegistry(_addressListRegistry);

        // Create new list
        uint256 listId = IAddressListRegistry(_addressListRegistry).createList({
            _owner: address(this),
            _updateType: IAddressListRegistry.UpdateType.AddOnly,
            _initialItems: new address[](0)
        });
        LIST_ID = listId;

        // Attest to new list
        uint256[] memory listIds = new uint256[](1);
        string[] memory descriptions = new string[](1);
        listIds[0] = listId;
        descriptions[0] = _listDescription;

        IAddressListRegistry(_addressListRegistry).attestLists({_ids: listIds, _descriptions: descriptions});
    }

    /// @notice Add items to the list after subjecting them to validation
    /// @param _items Items to add
    /// @dev Override if access control needed
    function addValidatedItemsToList(address[] calldata _items) external virtual {
        __validateItems(_items);

        ADDRESS_LIST_REGISTRY_CONTRACT.addToList({_id: LIST_ID, _items: _items});
    }

    /// @dev Required virtual helper to validate items prior to adding them to the list
    function __validateItems(address[] calldata _items) internal virtual;
}
