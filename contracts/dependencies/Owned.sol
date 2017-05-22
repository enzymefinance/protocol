pragma solidity ^0.4.11;

contract Owned {

    // FIELDS

    address public owner;

    // DBC INTERNALS

    function isOwner()
        internal
        returns (bool)
    {
        return msg.sender == owner;
    }

    // NON-CONSTANT METHODS

    function Owned() {
        owner = msg.sender;
    }

}
