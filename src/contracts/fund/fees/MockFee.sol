pragma solidity ^0.4.21;

import "./Fee.i.sol";

contract MockFee is Fee {

    uint public fee;
    uint public FEE_RATE;
    uint public FEE_PERIOD;

    function setFeeAmount(uint amount) public {
        fee = amount;
    }

    function feeAmount() public view returns (uint feeInShares) {
        return fee;
    }

    function initializeForUser(uint feeRate, uint feePeriod) external {
        fee = 0;
        FEE_RATE = feeRate;
        FEE_PERIOD = feePeriod;
    }

    function updateState() external {
        fee = 0;
    }
}

