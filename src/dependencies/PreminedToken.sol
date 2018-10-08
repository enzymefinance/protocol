pragma solidity ^0.4.21;


import "./StandardToken.sol";

contract PreminedToken is StandardToken {
    constructor() {
        uint preminedAmount = 10**30;
        totalSupply_ = preminedAmount;
        balances[msg.sender] = totalSupply_;
    }
}

