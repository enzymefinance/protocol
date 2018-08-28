pragma solidity ^0.4.21;


contract FixedPerformanceFee is Fee {

    uint public PERFORMANCE_FEE_RATE = 10 ** 16; // 0.01*10^18, or 1%
    uint public DIVISOR = 10 ** 18;

    uint public highWaterMark;
    uint public lastPayoutTime;

    function calculate(address hub) external returns (uint performanceFee) {
        uint currentSharePrice = hub.accounting.calcSharePrice();
        if (currentSharePrice > highWaterMark) {
            uint gav = hub.accounting.calcGav();
            uint sharePriceGain = sub(currentSharePrice, highWaterMark);
            uint totalGain = div(mul(sharePriceGain, hub.shares.totalSupply()), DIVISOR);
            performanceFee = div(mul(totalGain, PERFORMANCE_FEE_RATE), DIVISOR);

            lastPayout = block.timestamp;   // update state
            highWaterMark = currentSharePrice;
        } else {
            performanceFee = 0;
        }
        return performanceFee;
    }
}

