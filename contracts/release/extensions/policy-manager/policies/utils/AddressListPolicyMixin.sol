// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/utils/EnumerableSet.sol";

/// @title AddressListPolicyBase Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice An abstract base contract for an address list
abstract contract AddressListPolicyMixin {
    using EnumerableSet for EnumerableSet.AddressSet;

    event AddressesAdded(address indexed comptrollerProxy, address[] items);

    event AddressesRemoved(address indexed comptrollerProxy, address[] items);

    mapping(address => EnumerableSet.AddressSet) private comptrollerProxyToList;

    // EXTERNAL FUNCTIONS

    // TODO: do we want to provide length and get in case of super long lists?

    /// @notice Get all addresses in a fund's list
    /// @param _comptrollerProxy The fund's ComptrollerProxy address
    /// @return list_ An array of addresses
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
        require(_items.length > 0, "__addToList: no addresses provided");

        for (uint256 i = 0; i < _items.length; i++) {
            require(
                comptrollerProxyToList[_comptrollerProxy].add(_items[i]),
                "__addToList: address already exists in list"
            );
        }

        emit AddressesAdded(_comptrollerProxy, _items);
    }

    /// @dev Helper to remove addresses from the calling fund's list
    function __removeFromList(address _comptrollerProxy, address[] memory _items) internal {
        require(_items.length > 0, "__removeFromList: no addresses provided");

        for (uint256 i = 0; i < _items.length; i++) {
            require(
                comptrollerProxyToList[_comptrollerProxy].remove(_items[i]),
                "__removeFromList: address does not exist in list"
            );
        }

        emit AddressesRemoved(_comptrollerProxy, _items);
    }
}
