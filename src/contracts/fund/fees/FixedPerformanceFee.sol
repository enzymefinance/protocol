pragma solidity ^0.4.21;


import "./Fee.i.sol";
import "../accounting/Accounting.sol";
import "../hub/Hub.sol";
import "../shares/Shares.sol";
import "../../dependencies/math.sol";

contract FixedPerformanceFee is DSMath, Fee {

    uint public PERFORMANCE_FEE_RATE = 10 ** 16; // 0.01*10^18, or 1%
    uint public DIVISOR = 10 ** 18;

    uint public highWaterMark;
    uint public lastPayoutTime;

    function amountFor(address hub) public view returns (uint feeInShares) {
        Accounting accounting = Accounting(Hub(hub).accounting());
        Shares shares = Shares(Hub(hub).shares());
        uint currentSharePrice = accounting.calcSharePrice();
        if (currentSharePrice > highWaterMark) {
            uint gav = accounting.calcGav();
            if (gav == 0) {
                feeInShares = 0;
            } else {
                uint sharePriceGain = sub(currentSharePrice, highWaterMark);
                uint totalGain = mul(sharePriceGain, shares.totalSupply()) / DIVISOR;
                uint feeInAsset = mul(totalGain, PERFORMANCE_FEE_RATE) / DIVISOR;
                feeInShares = mul(shares.totalSupply(), feeInAsset) / gav;
            }
        } else {
            feeInShares = 0;
        }
        return feeInShares;
    }

    // TODO: avoid replication of variables between this and amountFor
    function updateFor(address hub) external {
        if(amountFor(hub) > 0) {
            Accounting accounting = Accounting(Hub(hub).accounting());
            lastPayoutTime = block.timestamp;
            highWaterMark = accounting.calcSharePrice();
        }
    }
}

