pragma solidity ^0.4.21;

import "./Fee.i.sol";

contract MockFee is Fee {

    uint public fee;

    function setFeeAmount(uint amount) public {
        fee = amount;
    }

    function feeAmount() public view returns (uint feeInShares) {
        return fee;
    }

    function updateState() external {
        fee = 0;
    }
}

