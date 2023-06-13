// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.19;

import {Uint256ArrayLib as ProdUint256ArrayLib} from "contracts/utils/0.8.19/Uint256ArrayLib.sol";

library Uint256ArrayLib {
    using ProdUint256ArrayLib for uint256[];

    ///////////////////////
    // PRODUCTION COPIES //
    ///////////////////////

    // STORAGE

    function removeStorageItem(uint256[] storage _self, uint256 _itemToRemove) internal returns (bool removed_) {
        return _self.removeStorageItem(_itemToRemove);
    }

    function storageArrayContains(uint256[] storage _self, uint256 _target) internal view returns (bool doesContain_) {
        return _self.storageArrayContains(_target);
    }

    // MEMORY

    function addItem(uint256[] memory _self, uint256 _itemToAdd) internal pure returns (uint256[] memory nextArray_) {
        return _self.addItem(_itemToAdd);
    }

    function addUniqueItem(uint256[] memory _self, uint256 _itemToAdd)
        internal
        pure
        returns (uint256[] memory nextArray_)
    {
        return _self.addUniqueItem(_itemToAdd);
    }

    function contains(uint256[] memory _self, uint256 _target) internal pure returns (bool doesContain_) {
        return _self.contains(_target);
    }

    function mergeArray(uint256[] memory _self, uint256[] memory _arrayToMerge)
        internal
        pure
        returns (uint256[] memory nextArray_)
    {
        return _self.mergeArray(_arrayToMerge);
    }

    function isUniqueSet(uint256[] memory _self) internal pure returns (bool isUnique_) {
        return _self.isUniqueSet();
    }

    function removeItems(uint256[] memory _self, uint256[] memory _itemsToRemove)
        internal
        pure
        returns (uint256[] memory nextArray_)
    {
        return _self.removeItems(_itemsToRemove);
    }

    ///////////////////
    // NEW FUNCTIONS //
    ///////////////////

    // MEMORY

    function find(uint256[] memory _self, uint256 _target) internal pure returns (bool found_, uint256 index_) {
        for (uint256 i; i < _self.length; i++) {
            if (_self[i] == _target) {
                return (true, i);
            }
        }

        return (false, type(uint256).max);
    }

    function removeAtIndex(uint256[] memory _self, uint256 _index)
        internal
        pure
        returns (uint256[] memory nextArray_)
    {
        uint256 oldLength = _self.length;
        require(_index < oldLength, "removeAtIndex: Index out of bounds");

        uint256 nextArrayIndex;
        nextArray_ = new uint256[](oldLength - 1);
        for (uint256 i; i < oldLength; i++) {
            if (i != _index) {
                nextArray_[nextArrayIndex] = _self[i];
                nextArrayIndex++;
            }
        }

        return nextArray_;
    }
}
