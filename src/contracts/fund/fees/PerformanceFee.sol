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
    uint public constant REDEEM_WINDOW = 1 weeks;

    mapping(address => uint) public initialSharePrice;
    mapping(address => uint) public highWaterMark;
    mapping(address => uint) public lastPayoutTime;
    mapping(address => uint) public initializeTime;
    mapping(address => uint) public performanceFeeRate;
    mapping(address => uint) public performanceFeePeriod;

    /// @notice Sets initial state of the fee for a user
    function initializeForUser(uint feeRate, uint feePeriod) external {
        require(lastPayoutTime[msg.sender] == 0, "Already initialized");
        Hub hub = FeeManager(msg.sender).hub();
        initialSharePrice[msg.sender] = 10 ** Accounting(hub.accounting()).DEFAULT_SHARE_PRICE();
        performanceFeeRate[msg.sender] = feeRate;
        performanceFeePeriod[msg.sender] = feePeriod;
        highWaterMark[msg.sender] = INITIAL_SHARE_PRICE;
        lastPayoutTime[msg.sender] = block.timestamp;
        initializeTime[msg.sender] = block.timestamp;
    }

    /// @notice Assumes management fee is zero
    function feeAmount() public view returns (uint feeInShares) {
        Hub hub = FeeManager(msg.sender).hub();
        Accounting accounting = Accounting(hub.accounting());
        Shares shares = Shares(hub.shares());
        uint gav = accounting.calcGav();
        uint gavPerShare = shares.totalSupply() > 0 ?
            accounting.valuePerShare(gav, shares.totalSupply())
            : accounting.DEFAULT_SHARE_PRICE();
        if (
            gavPerShare > highWaterMark[msg.sender] &&
            shares.totalSupply() != 0 &&
            gav != 0
        ) {
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

    function canUpdate(address _who) public view returns (bool) {
        uint timeSinceInit = sub(
            block.timestamp,
            initializeTime[_who]
        );
        uint secondsSinceLastPeriod = timeSinceInit % performanceFeePeriod[_who];
        uint lastPeriodEnd = sub(block.timestamp, secondsSinceLastPeriod);
        return (
            secondsSinceLastPeriod <= REDEEM_WINDOW &&
            lastPayoutTime[_who] < lastPeriodEnd
        );
    }

    function updateState() external {
        require(lastPayoutTime[msg.sender] != 0, "Not initialized");
        require(
            canUpdate(msg.sender),
            "Not within a update window or already updated this period"
        );
        Accounting accounting = Accounting(Hub(FeeManager(msg.sender).hub()).accounting());
        uint currentSharePrice = accounting.calcSharePrice();
        require(
            currentSharePrice > highWaterMark[msg.sender],
            "Current share price does not pass high water mark"
        );
        lastPayoutTime[msg.sender] = block.timestamp;
        highWaterMark[msg.sender] = currentSharePrice;
        emit HighWaterMarkUpdate(currentSharePrice);
    }
}

