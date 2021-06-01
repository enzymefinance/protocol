// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../release/utils/AddressArrayLib.sol";

/// @title TestAddressArrayLib Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A test implementation of AddressArrayLib
contract TestAddressArrayLib {
    using AddressArrayLib for address[];

    function mergeArray(address[] memory _array, address[] memory _arrayToMerge)
        external
        pure
        returns (address[] memory nextArray_)
    {
        return _array.mergeArray(_arrayToMerge);
    }
}
