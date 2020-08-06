// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../hub/Spoke.sol";
import "../shares/Shares.sol";
import "../vault/Vault.sol";

/// @title PerformanceFee Contract
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Calculates the performace fee for a particular fund
contract PerformanceFee {
    using SafeMath for uint256;

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
        highWaterMark[msg.sender] = 10 ** uint(ERC20(denominationAsset).decimals());
        lastPayoutTime[msg.sender] = block.timestamp;
        initializeTime[msg.sender] = block.timestamp;
    }

    /// @notice Assumes management fee is zero
    function feeAmount() external returns (uint feeInShares) {
        Shares shares = Shares(IHub(Spoke(msg.sender).HUB()).shares());
        uint sharesSupply = shares.totalSupply();
        if (sharesSupply == 0) return 0;

        uint gav = shares.calcGav();
        uint gavPerShare = gav.mul(10 ** uint256(shares.decimals())).div(sharesSupply);
        if (gavPerShare <= highWaterMark[msg.sender]) return 0;

        uint sharePriceGain = gavPerShare.sub(highWaterMark[msg.sender]);
        uint totalGain = sharePriceGain.mul(sharesSupply).div(DIVISOR);
        uint feeInAsset = totalGain.mul(performanceFeeRate[msg.sender]).div(DIVISOR);
        uint preDilutionFee = sharesSupply.mul(feeInAsset).div(gav);

        return preDilutionFee.mul(sharesSupply).div(sharesSupply.sub(preDilutionFee));
    }

    function canUpdate(address _who) public view returns (bool) {
        uint timeSinceInit = uint256(block.timestamp).sub(initializeTime[_who]);
        uint secondsSinceLastPeriod = timeSinceInit.mod(performanceFeePeriod[_who]);
        uint lastPeriodEnd = uint256(block.timestamp).sub(secondsSinceLastPeriod);
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
        Shares shares = Shares(IHub(Spoke(msg.sender).HUB()).shares());

        uint currentGavPerShare = shares.calcGav().mul(10 ** uint256(shares.decimals())).div(shares.totalSupply());
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
