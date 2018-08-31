pragma solidity ^0.4.21;


import "./Fee.i.sol";
import "../accounting/Accounting.sol";
import "../hub/Hub.sol";
import "../shares/Shares.sol";
import "../../../src/dependencies/math.sol";

contract FixedManagementFee is DSMath, Fee {

    uint public PAYMENT_TERM = 1 years;
    uint public MANAGEMENT_FEE_RATE = 10 ** 16; // 0.01*10^18, or 1%
    uint public DIVISOR = 10 ** 18;

    uint public lastPayoutTime;

    function amountFor(address hub) public view returns (uint feeInShares) {
        Accounting accounting = Accounting(Hub(hub).accounting());
        Shares shares = Shares(Hub(hub).shares());
        uint gav = accounting.calcGav();
        if (gav == 0) {
            feeInShares = 0;
        } else {
            uint timePassed = sub(block.timestamp, lastPayoutTime);
            uint gavPercentage = mul(timePassed, gav) / (1 years);
            uint feeInAsset = mul(gavPercentage, MANAGEMENT_FEE_RATE) / DIVISOR;
            feeInShares = mul(shares.totalSupply(), feeInAsset) / gav;
        }
        return feeInShares;
    }

    function updateFor(address hub) external {
        lastPayoutTime = block.timestamp;
    }
}

