pragma solidity 0.6.4;

/// @title Factory Template
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Factory to create and manage child instances
contract Factory {
    mapping (address => bool) public childExists;

    event NewInstance(
        address indexed hub,
        address indexed instance
    );

    function isInstance(address _child) public view returns (bool) {
        return childExists[_child];
    }
}
