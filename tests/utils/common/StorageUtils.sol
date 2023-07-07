// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {CommonUtilsBase} from "tests/utils/bases/CommonUtilsBase.sol";
import {AddressLib} from "tests/utils/libs/AddressLib.sol";

abstract contract StorageUtils is CommonUtilsBase {
    using AddressLib for address;

    // ARRAY HELPERS

    // These will only work with arrays where each item occupies 32 bytes, e.g., not uint8[]

    function deriveArrayItemSlot(bytes32 _arraySlot, uint256 _itemIndex) internal pure returns (bytes32 item_) {
        return bytes32(uint256(keccak256(abi.encodePacked(_arraySlot))) + _itemIndex);
    }

    function getArrayItemAtSlot(address _storageContract, bytes32 _arraySlot, uint256 _itemIndex)
        internal
        view
        returns (bytes32 item_)
    {
        bytes32 newItemSlot = deriveArrayItemSlot(_arraySlot, _itemIndex);

        return vm.load(_storageContract, newItemSlot);
    }

    function storeNewArrayItemAtSlot(address _storageContract, bytes32 _arraySlot, address _newItem) internal {
        storeNewArrayItemAtSlot(_storageContract, _arraySlot, _newItem.toBytes32());
    }

    function storeNewArrayItemAtSlot(address _storageContract, bytes32 _arraySlot, uint256 _newItem) internal {
        storeNewArrayItemAtSlot(_storageContract, _arraySlot, bytes32(_newItem));
    }

    function storeNewArrayItemAtSlot(address _storageContract, bytes32 _arraySlot, bytes32 _newItem) internal {
        uint256 initialLength = uint256(vm.load(_storageContract, _arraySlot));

        // Increase array length
        vm.store(_storageContract, _arraySlot, bytes32(initialLength + 1));
        // Add new item
        bytes32 newItemSlot = deriveArrayItemSlot(_arraySlot, initialLength);
        vm.store(_storageContract, newItemSlot, _newItem);
    }
}
