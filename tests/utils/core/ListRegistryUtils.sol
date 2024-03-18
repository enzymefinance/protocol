// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IAddressListRegistry as IAddressListRegistryProd} from
    "contracts/persistent/address-list-registry/IAddressListRegistry.sol";

import {IAddressListRegistry} from "tests/interfaces/internal/IAddressListRegistry.sol";
import {CoreUtilsBase} from "tests/utils/bases/CoreUtilsBase.sol";

abstract contract ListRegistryUtils is CoreUtilsBase {
    function createRegisteredAddressList(IAddressListRegistry _addressListRegistry, address _item)
        internal
        returns (uint256 listId_, address owner_)
    {
        listId_ = _addressListRegistry.getListCount();
        owner_ = makeAddr(string(abi.encodePacked("createRegisteredAddressList", listId_)));

        _addressListRegistry.createList({
            _owner: owner_,
            _updateType: formatAddressListRegistryUpdateType(IAddressListRegistryProd.UpdateType.AddAndRemove),
            _initialItems: toArray(_item)
        });

        return (listId_, owner_);
    }
}
