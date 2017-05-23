pragma solidity ^0.4.11;

contract MutexUser {

    // FIELDS

    bool private lock;

    // MODIFIERS

    modifier exclusive {
        assert(!lock);
        lock = true;
        _;
        lock = false;
    }
    
}
