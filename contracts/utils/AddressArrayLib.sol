// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

/// @title AddressArray Library
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice A library to extend the address array data type
library AddressArrayLib {
    /// @dev Helper to verify if an array contains a particular value
    function contains(address[] memory _self, address _target) internal pure returns (bool) {
        for (uint256 i = 0; i < _self.length; i++) {
            if (_target == _self[i]) return true;
        }
        return false;
    }

    /// @dev Helper to verify if array is a set of unique values.
    /// Does not assert length > 0.
    function isUniqueSet(address[] memory _self) internal pure returns (bool) {
        uint256 arrayLength = _self.length;
        if (arrayLength <= 1) return true;

        for (uint256 i = 0; i < arrayLength; i++) {
            for (uint256 j = i + 1; j < arrayLength; j++) {
                if (_self[i] == _self[j]) return false;
            }
        }

        return true;
    }
}
