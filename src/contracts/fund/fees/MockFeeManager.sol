pragma solidity ^0.4.21;
pragma experimental ABIEncoderV2;

import "Fee.i.sol";
import "Spoke.sol";
import "Shares.sol";
import "Factory.sol";
import "math.sol";
import "AmguConsumer.sol";

contract MockFeeManager is DSMath, AmguConsumer, Spoke {

    struct FeeInfo {
        address feeAddress;
        uint feeRate;
        uint feePeriod;
    }

    uint totalFees;
    uint performanceFees;

    constructor(
        address _hub, address _denominationAsset, address[] _fees, uint[] _periods, uint _rates
    ) Spoke(_hub) public {}

    function setTotalFeeAmount(uint _amt) public { totalFees = _amt; }
    function setPerformanceFeeAmount(uint _amt) public { performanceFees = _amt; }

    function rewardManagementFee() public { return; }
    function performanceFeeAmount() public view returns (uint) { return performanceFees; }
    function totalFeeAmount() public view returns (uint) { return totalFees; }
}
