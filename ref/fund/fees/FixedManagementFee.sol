pragma solidity ^0.4.21;


contract FixedManagementFee is Fee {

    uint public PAYMENT_TERM = 1 years;
    uint public MANAGEMENT_FEE_RATE = 10 ** 16; // 0.01*10^18, or 1%
    uint public DIVISOR = 10 ** 18;

    uint public lastPayoutTime;

    function calculate(address hub) external returns (uint managementFee) {
        uint gav = hub.accounting.calcGav();
        uint timePassed = sub(block.timestamp, lastPayoutTime);
        uint gavPercentage = mul(timePassed, gav) / (1 years);
        managementFee = mul(gavPercentage, MANAGEMENT_FEE_RATE) / DIVISOR;

        lastPayout = block.timestamp;   // update state

        return managementFee;
    }
}

