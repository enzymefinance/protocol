pragma solidity ^0.4.21;


import "../../src/assets/Asset.sol";

contract PreminedToken is Asset {
    constructor() {
        uint preminedAmount = 10**30;
        _totalSupply = preminedAmount;
        balances[msg.sender] = _totalSupply;
    }
}

