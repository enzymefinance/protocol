pragma solidity 0.6.8;

import "../../../dependencies/libs/Bytes4EnumerableSet.sol";

/// @title Bytes4ListPolicyBase Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice An abstract base contract for an bytes4 list
abstract contract Bytes4ListPolicyMixin {
    using Bytes4EnumerableSet for Bytes4EnumerableSet.Bytes4Set;

    event Bytes4ItemsAdded(address policyManager, bytes4[] items);

    event Bytes4ItemsRemoved(address policyManager, bytes4[] items);

    mapping (address => Bytes4EnumerableSet.Bytes4Set) policyManagerToList;

    // EXTERNAL FUNCTIONS

    // TODO: do we want to provide length and get in case of super long lists?

    /// @notice Get all bytes4 items in a fund's list
    /// @param _policyManager The fund's PolicyManager address
    /// @return An array of bytes4 items
    function getList(address _policyManager) external view returns (bytes4[] memory) {
        return Bytes4EnumerableSet.enumerate(policyManagerToList[_policyManager]);
    }

    // PUBLIC FUNCTIONS

    /// @notice Check if an bytes4 item is in a fund's list
    /// @param _policyManager The fund's PolicyManager address
    /// @param _item The bytes4 item to check against the list
    /// @return True if the bytes4 item is in the list
    function isInList(address _policyManager, bytes4 _item) public view returns (bool) {
        return Bytes4EnumerableSet.contains(policyManagerToList[_policyManager], _item);
    }

    // INTERNAL FUNCTIONS

    /// @notice Helper to add bytes4 items to the calling fund's list
    function __addToList(bytes4[] memory _items) internal {
        require(_items.length > 0, "__addToList: no bytes4 items provided");

        for (uint256 i = 0; i < _items.length; i++) {
            require(
                Bytes4EnumerableSet.add(policyManagerToList[msg.sender], _items[i]),
                "__addToList: bytes4 item already exists in list"
            );
        }

        emit Bytes4ItemsAdded(msg.sender, _items);
    }

    /// @notice Helper to remmove bytes4 items from the calling fund's list
    function __removeFromList(bytes4[] memory _items) internal {
        require(_items.length > 0, "__removeFromList: no bytes4 items provided");

        for (uint256 i = 0; i < _items.length; i++) {
            require(
                Bytes4EnumerableSet.remove(policyManagerToList[msg.sender], _items[i]),
                "__removeFromList: bytes4 item does not exist in list"
            );
        }

        emit Bytes4ItemsRemoved(msg.sender, _items);
    }
}
