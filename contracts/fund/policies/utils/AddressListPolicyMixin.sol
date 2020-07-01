pragma solidity 0.6.8;

import "../../../dependencies/libs/EnumerableSet.sol";

/// @title AddressListPolicyBase Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice An abstract base contract for an address list
abstract contract AddressListPolicyMixin {
    using EnumerableSet for EnumerableSet.AddressSet;

    event AddressesAdded(address policyManager, address[] items);

    event AddressesRemoved(address policyManager, address[] items);

    mapping (address => EnumerableSet.AddressSet) policyManagerToList;

    // EXTERNAL FUNCTIONS

    // TODO: do we want to provide length and get in case of super long lists?

    /// @notice Get all addresses in a fund's list
    /// @param _policyManager The fund's PolicyManager address
    /// @return An array of addresses
    function getList(address _policyManager) external view returns (address[] memory) {
        return EnumerableSet.enumerate(policyManagerToList[_policyManager]);
    }

    // PUBLIC FUNCTIONS

    /// @notice Check if an address is in a fund's list
    /// @param _policyManager The fund's PolicyManager address
    /// @param _item The address to check against the list
    /// @return True if the address is in the list
    function isInList(address _policyManager, address _item) public view returns (bool) {
        return EnumerableSet.contains(policyManagerToList[_policyManager], _item);
    }

    // INTERNAL FUNCTIONS

    /// @notice Helper to add addresses to the calling fund's list
    function __addToList(address[] memory _items) internal {
        require(_items.length > 0, "__addToList: no addresses provided");

        for (uint256 i = 0; i < _items.length; i++) {
            require(
                EnumerableSet.add(policyManagerToList[msg.sender], _items[i]),
                "__addToList: address already exists in list"
            );
        }

        emit AddressesAdded(msg.sender, _items);
    }

    /// @notice Helper to remmove addresses from the calling fund's list
    function __removeFromList(address[] memory _items) internal {
        require(_items.length > 0, "__removeFromList: no addresses provided");

        for (uint256 i = 0; i < _items.length; i++) {
            require(
                EnumerableSet.remove(policyManagerToList[msg.sender], _items[i]),
                "__removeFromList: address does not exist in list"
            );
        }

        emit AddressesRemoved(msg.sender, _items);
    }
}
