// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/utils/EnumerableSet.sol";

/// @title AddressListPolicyMixin Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice An abstract mixin contract for policies that use an address list
abstract contract AddressListPolicyMixin {
    using EnumerableSet for EnumerableSet.AddressSet;

    event AddressesAdded(address indexed comptrollerProxy, address[] items);

    event AddressesRemoved(address indexed comptrollerProxy, address[] items);

    mapping(address => EnumerableSet.AddressSet) private comptrollerProxyToList;

    // EXTERNAL FUNCTIONS

    /// @notice Get all addresses in a fund's list
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @return list_ The addresses in the fund's list
    function getList(address _comptrollerProxy) external view returns (address[] memory list_) {
        list_ = new address[](comptrollerProxyToList[_comptrollerProxy].length());
        for (uint256 i = 0; i < list_.length; i++) {
            list_[i] = comptrollerProxyToList[_comptrollerProxy].at(i);
        }
        return list_;
    }

    // PUBLIC FUNCTIONS

    /// @notice Check if an address is in a fund's list
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @param _item The address to check against the list
    /// @return isInList_ True if the address is in the list
    function isInList(address _comptrollerProxy, address _item)
        public
        view
        returns (bool isInList_)
    {
        return comptrollerProxyToList[_comptrollerProxy].contains(_item);
    }

    // INTERNAL FUNCTIONS

    /// @dev Helper to add addresses to the calling fund's list
    function __addToList(address _comptrollerProxy, address[] memory _items) internal {
        require(_items.length > 0, "__addToList: No addresses provided");

        for (uint256 i = 0; i < _items.length; i++) {
            require(
                comptrollerProxyToList[_comptrollerProxy].add(_items[i]),
                "__addToList: Address already exists in list"
            );
        }

        emit AddressesAdded(_comptrollerProxy, _items);
    }

    /// @dev Helper to remove addresses from the calling fund's list
    function __removeFromList(address _comptrollerProxy, address[] memory _items) internal {
        require(_items.length > 0, "__removeFromList: No addresses provided");

        for (uint256 i = 0; i < _items.length; i++) {
            require(
                comptrollerProxyToList[_comptrollerProxy].remove(_items[i]),
                "__removeFromList: Address does not exist in list"
            );
        }

        emit AddressesRemoved(_comptrollerProxy, _items);
    }
}
