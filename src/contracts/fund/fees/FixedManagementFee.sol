pragma solidity ^0.4.21;

import "./Fee.i.sol";
import "./FeeManager.sol";
import "../accounting/Accounting.sol";
import "../hub/Hub.sol";
import "../shares/Shares.sol";
import "../../dependencies/math.sol";

contract FixedManagementFee is DSMath, Fee {

    uint public PAYMENT_TERM = 1 years;
    uint public MANAGEMENT_FEE_RATE = 10 ** 16; // 0.01*10^18, or 1%
    uint public DIVISOR = 10 ** 18;

    mapping (address => uint) public lastPayoutTime;

    function feeAmount() public view returns (uint feeInShares) {
        Hub hub = FeeManager(msg.sender).hub();
        Accounting accounting = Accounting(hub.accounting());
        Shares shares = Shares(hub.shares());
        uint gav = accounting.calcGav();
        if (gav == 0) {
            feeInShares = 0;
        } else {
            uint timePassed = sub(block.timestamp, lastPayoutTime[msg.sender]);
            uint gavPercentage = mul(timePassed, gav) / 1 years;
            uint feeInAsset = mul(gavPercentage, MANAGEMENT_FEE_RATE) / DIVISOR;
            uint preDilutionFee = mul(shares.totalSupply(), feeInAsset) / gav;
            feeInShares =
                mul(preDilutionFee, shares.totalSupply()) /
                sub(shares.totalSupply(), preDilutionFee);
        }
        return feeInShares;
    }

    function updateState() external {
        lastPayoutTime[msg.sender] = block.timestamp;
    }
}

