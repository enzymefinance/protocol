pragma solidity 0.6.4;

import "../../dependencies/DSMath.sol";
import "../hub/Spoke.sol";
import "../shares/Shares.sol";
import "../vault/Vault.sol";

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
        Shares shares = Shares(IHub(Spoke(msg.sender).getHub()).shares());
        uint sharesSupply = shares.totalSupply();
        if (sharesSupply == 0) return 0;

        uint gav = shares.calcGav();
        uint gavPerShare = mul(gav, 10 ** uint256(shares.decimals())) / sharesSupply;
        if (gavPerShare <= highWaterMark[msg.sender]) return 0;

        uint sharePriceGain = sub(gavPerShare, highWaterMark[msg.sender]);
        uint totalGain = mul(sharePriceGain, sharesSupply) / DIVISOR;
        uint feeInAsset = mul(totalGain, performanceFeeRate[msg.sender]) / DIVISOR;
        uint preDilutionFee = mul(sharesSupply, feeInAsset) / gav;

        return mul(preDilutionFee, sharesSupply) / sub(sharesSupply, preDilutionFee);
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
        Shares shares = Shares(IHub(Spoke(msg.sender).getHub()).shares());

        uint currentGavPerShare = mul(
            shares.calcGav(),
            10 ** uint256(shares.decimals())
        ) / shares.totalSupply();
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
