pragma solidity ^0.4.21;

import "./Fee.sol";

contract FeeManager {

    function register(address fee) public {
        // implement; need to make a couple decisions first
    }

    function batchRegister(address[] fees) public {
        for (uint i = 0; i < fees.length; i++) {
            register(fees[i]);
        }
    }
}

