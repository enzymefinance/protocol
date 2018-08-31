pragma solidity ^0.4.21;


import "./Fee.i.sol";
import "../../../src/dependencies/math.sol";

// TODO: return value in SHARES
contract FixedPerformanceFee is DSMath, Fee {

    uint public PERFORMANCE_FEE_RATE = 10 ** 16; // 0.01*10^18, or 1%
    uint public DIVISOR = 10 ** 18;

    uint public highWaterMark;
    uint public lastPayoutTime;

    function amountFor(address hub) external view returns (uint performanceFee) {
        uint currentSharePrice = hub.accounting.calcSharePrice();
        if (currentSharePrice > highWaterMark) {
            uint gav = hub.accounting.calcGav();
            uint sharePriceGain = sub(currentSharePrice, highWaterMark);
            uint totalGain = div(mul(sharePriceGain, hub.shares.totalSupply()), DIVISOR);
            performanceFee = div(mul(totalGain, PERFORMANCE_FEE_RATE), DIVISOR);
        } else {
            performanceFee = 0;
        }
        return performanceFee;
    }

    function updateFor(address hub) external {
        if(amount(hub) > 0) {
            lastPayout = block.timestamp;
            highWaterMark = currentSharePrice;
        }
    }
}

