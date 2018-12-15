pragma solidity ^0.4.21;

import "Fee.i.sol";
import "FeeManager.sol";
import "Accounting.sol";
import "Hub.sol";
import "Shares.sol";
import "math.sol";

contract PerformanceFee is DSMath, Fee {

    event HighWaterMarkUpdate(uint hwm);

    uint public constant DIVISOR = 10 ** 18;
    uint public constant INITIAL_SHARE_PRICE = 10 ** 18;

    mapping(address => uint) public highWaterMark;
    mapping(address => uint) public lastPayoutTime;
    mapping(address => uint) public performanceFeeRate;
    mapping(address => uint) public performanceFeePeriod;


    /// @notice Sets initial state of the fee for a user
    function initializeForUser(uint feeRate, uint feePeriod) external {
        require(lastPayoutTime[msg.sender] == 0, "Already initialized");
        performanceFeeRate[msg.sender] == feeRate;
        performanceFeePeriod[msg.sender] = feePeriod;
        highWaterMark[msg.sender] = INITIAL_SHARE_PRICE;
        lastPayoutTime[msg.sender] = block.timestamp;
    }

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
            uint feeInAsset = mul(totalGain, performanceFeeRate[msg.sender]) / DIVISOR;
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

    function updateState() external {
        require(lastPayoutTime[msg.sender] != 0, "Not initialized");
        Accounting accounting = Accounting(Hub(FeeManager(msg.sender).hub()).accounting());
        uint currentSharePrice = accounting.calcSharePrice();
        require(
            currentSharePrice > highWaterMark[msg.sender],
            "Current share price does not pass high water mark"
        );
        require(
            block.timestamp > add(lastPayoutTime[msg.sender], performanceFeePeriod[msg.sender]),
            "Performance period has not yet ended"
        );
        lastPayoutTime[msg.sender] = block.timestamp;
        highWaterMark[msg.sender] = currentSharePrice;
        emit HighWaterMarkUpdate(currentSharePrice);
    }
}

