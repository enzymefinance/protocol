pragma solidity 0.6.1;

import "./FeeManager.sol";
import "../accounting/Accounting.sol";
import "../hub/Hub.sol";
import "../shares/Shares.sol";
import "../../dependencies/DSMath.sol";

contract PerformanceFee is DSMath {

    event HighWaterMarkUpdate(address indexed feeManager, uint indexed hwm);

    uint public constant DIVISOR = 10 ** 18;
    uint public constant REDEEM_WINDOW = 1 weeks;

    mapping(address => uint) public highWaterMark;
    mapping(address => uint) public lastPayoutTime;
    mapping(address => uint) public initializeTime;
    mapping(address => uint) public performanceFeeRate;
    mapping(address => uint) public performanceFeePeriod;

    /// @notice Sets initial state of the fee for a user
    function initializeForUser(uint feeRate, uint feePeriod, address denominationAsset) external {
        require(lastPayoutTime[msg.sender] == 0, "Already initialized");
        performanceFeeRate[msg.sender] = feeRate;
        performanceFeePeriod[msg.sender] = feePeriod;
        highWaterMark[msg.sender] = 10 ** uint(ERC20WithFields(denominationAsset).decimals());
        lastPayoutTime[msg.sender] = block.timestamp;
        initializeTime[msg.sender] = block.timestamp;
    }

    /// @notice Assumes management fee is zero
    function feeAmount() external returns (uint feeInShares) {
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

    /// @notice Assumes management fee is zero
    function updateState() external {
        require(lastPayoutTime[msg.sender] != 0, "Not initialized");
        require(
            canUpdate(msg.sender),
            "Not within a update window or already updated this period"
        );
        Hub hub = FeeManager(msg.sender).hub();
        Accounting accounting = Accounting(hub.accounting());
        Shares shares = Shares(hub.shares());
        uint gav = accounting.calcGav();
        uint currentGavPerShare = accounting.valuePerShare(gav, shares.totalSupply());
        require(
            currentGavPerShare > highWaterMark[msg.sender],
            "Current share price does not pass high water mark"
        );
        lastPayoutTime[msg.sender] = block.timestamp;
        highWaterMark[msg.sender] = currentGavPerShare;
        emit HighWaterMarkUpdate(msg.sender, currentGavPerShare);
    }

    function identifier() external pure returns (uint) {
        return 1;
    }
}
