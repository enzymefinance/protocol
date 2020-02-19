pragma solidity 0.6.1;

contract MockFee {

    uint public fee;
    uint public FEE_RATE;
    uint public FEE_PERIOD;
    uint public feeNumber;

    constructor(uint _feeNumber) public {
        feeNumber = _feeNumber;
    }

    function setFeeAmount(uint amount) public {
        fee = amount;
    }

    function feeAmount() external returns (uint feeInShares) {
        return fee;
    }

    function initializeForUser(uint feeRate, uint feePeriod, address denominationAsset) external {
        fee = 0;
        FEE_RATE = feeRate;
        FEE_PERIOD = feePeriod;
    }

    function updateState() external {
        fee = 0;
    }

    function identifier() external view returns (uint) {
        return feeNumber;
    }
}

