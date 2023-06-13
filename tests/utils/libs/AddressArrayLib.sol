// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.19;

import {AddressArrayLib as ProdAddressArrayLib} from "contracts/utils/0.8.19/AddressArrayLib.sol";

library AddressArrayLib {
    using ProdAddressArrayLib for address[];

    ///////////////////////
    // PRODUCTION COPIES //
    ///////////////////////

    // STORAGE

    function removeStorageItem(address[] storage _self, address _itemToRemove) internal returns (bool removed_) {
        return _self.removeStorageItem(_itemToRemove);
    }

    function storageArrayContains(address[] storage _self, address _target) internal view returns (bool doesContain_) {
        return _self.storageArrayContains(_target);
    }

    // MEMORY

    function addItem(address[] memory _self, address _itemToAdd) internal pure returns (address[] memory nextArray_) {
        return _self.addItem(_itemToAdd);
    }

    function addUniqueItem(address[] memory _self, address _itemToAdd)
        internal
        pure
        returns (address[] memory nextArray_)
    {
        return _self.addUniqueItem(_itemToAdd);
    }

    function contains(address[] memory _self, address _target) internal pure returns (bool doesContain_) {
        return _self.contains(_target);
    }

    function mergeArray(address[] memory _self, address[] memory _arrayToMerge)
        internal
        pure
        returns (address[] memory nextArray_)
    {
        return _self.mergeArray(_arrayToMerge);
    }

    function isUniqueSet(address[] memory _self) internal pure returns (bool isUnique_) {
        return _self.isUniqueSet();
    }

    function removeItems(address[] memory _self, address[] memory _itemsToRemove)
        internal
        pure
        returns (address[] memory nextArray_)
    {
        return _self.removeItems(_itemsToRemove);
    }

    ///////////////////
    // NEW FUNCTIONS //
    ///////////////////

    // MEMORY

    function find(address[] memory _self, address _target) internal pure returns (bool found_, uint256 index_) {
        for (uint256 i; i < _self.length; i++) {
            if (_self[i] == _target) {
                return (true, i);
            }
        }

        return (false, type(uint256).max);
    }

    function removeAtIndex(address[] memory _self, uint256 _index)
        internal
        pure
        returns (address[] memory nextArray_)
    {
        uint256 oldLength = _self.length;
        require(_index < oldLength, "removeAtIndex: Index out of bounds");

        uint256 nextArrayIndex;
        nextArray_ = new address[](oldLength - 1);
        for (uint256 i; i < oldLength; i++) {
            if (i != _index) {
                nextArray_[nextArrayIndex] = _self[i];
                nextArrayIndex++;
            }
        }

        return nextArray_;
    }
}
