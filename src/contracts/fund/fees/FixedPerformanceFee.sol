pragma solidity ^0.4.21;

import "./Fee.i.sol";
import "./FeeManager.sol";
import "../accounting/Accounting.sol";
import "../hub/Hub.sol";
import "../shares/Shares.sol";
import "../../dependencies/math.sol";

// TODO: think about third function on interface that conditionally updates but is also aware of fee amount
contract FixedPerformanceFee is DSMath, Fee {

    event HighWaterMarkUpdate(uint hwm);

    uint public PERFORMANCE_FEE_RATE = 10 ** 16; // 0.01*10^18, or 1%
    uint public DIVISOR = 10 ** 18;
    uint public PERIOD = 90 days;

    mapping(address => uint) public highWaterMark;
    mapping(address => uint) public lastPayoutTime;

    /// @notice Assumes management fee is zero
    function feeAmount() public view returns (uint feeInShares) {
        Hub hub = FeeManager(msg.sender).hub();
        Accounting accounting = Accounting(hub.accounting());
        Shares shares = Shares(hub.shares());
        uint gav = accounting.calcGav();
        uint gavPerShare = shares.totalSupply() > 0 ? accounting.calcValuePerShare(gav, shares.totalSupply()) 
            : accounting.DEFAULT_SHARE_PRICE();
        if (gavPerShare > highWaterMark[msg.sender] && gav != 0) {
            uint sharePriceGain = sub(gavPerShare, highWaterMark[msg.sender]);
            uint totalGain = mul(sharePriceGain, shares.totalSupply()) / DIVISOR;
            uint feeInAsset = mul(totalGain, PERFORMANCE_FEE_RATE) / DIVISOR;
            uint preDilutionFee = mul(shares.totalSupply(), feeInAsset) / gav;
            feeInShares =
                mul(preDilutionFee, shares.totalSupply()) /
                sub(shares.totalSupply(), preDilutionFee);
        }
        else {
            feeInShares = 0;
        }
        return feeInShares;
    }

    // TODO: avoid replication of variables between this and feeAmount
    // TODO: avoid running everything twice when calculating & claiming fees
    function updateState() external {
        Accounting accounting = Accounting(Hub(FeeManager(msg.sender).hub()).accounting());
        // TODO: Assumes starting share price is 10 ** 18, make it more flexible
        uint currentSharePrice;
        if (lastPayoutTime[msg.sender] == 0) {
            currentSharePrice = 10 ** 18;
        } else {
            currentSharePrice = accounting.calcSharePrice();
        }
        require(
            currentSharePrice > highWaterMark[msg.sender],
            "Current share price does not pass high water mark"
        );
        require(
            block.timestamp > add(lastPayoutTime[msg.sender], PERIOD),
            "Performance period has not yet ended"
        );
        lastPayoutTime[msg.sender] = block.timestamp;
        highWaterMark[msg.sender] = currentSharePrice;
        emit HighWaterMarkUpdate(currentSharePrice);
    }
}

