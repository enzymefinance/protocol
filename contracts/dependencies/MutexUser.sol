pragma solidity ^0.4.4;

contract MutexUser {
    bool private lock;
    modifier exclusive {
        if (lock) throw;
        lock = true;
        _;
        lock = false;
    }
}
