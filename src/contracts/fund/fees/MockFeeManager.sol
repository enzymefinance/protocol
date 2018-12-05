pragma solidity ^0.4.21;
pragma experimental ABIEncoderV2;

import "./Fee.i.sol";
import "../hub/Spoke.sol";
import "../shares/Shares.sol";
import "../../factory/Factory.sol";
import "../../dependencies/math.sol";
import "../../engine/AmguConsumer.sol";

contract MockFeeManager is DSMath, AmguConsumer, Spoke {

    struct FeeInfo {
        address feeAddress;
        uint feeRate;
        uint feePeriod;
    }

    uint totalFees;
    uint performanceFees;

    constructor(address _hub, FeeInfo[] _fees) Spoke(_hub) public {}

    function setTotalFeeAmount(uint _amt) { totalFees = _amt; }
    function setPerformanceFeeAmount(uint _amt) { performanceFees = _amt; }

    function rewardManagementFee() { return; }
    function performanceFeeAmount() view returns (uint) { return performanceFees; }
    function totalFeeAmount() public view returns (uint) { return totalFees; }
}
