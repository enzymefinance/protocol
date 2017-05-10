pragma solidity ^0.4.11;

contract Owned {
    address public owner;

    function Owned() {
        owner = msg.sender;
    }

    modifier only_owner {
        if (msg.sender != owner) throw;
        _;
    }
}
