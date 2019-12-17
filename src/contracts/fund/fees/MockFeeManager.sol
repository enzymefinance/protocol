pragma solidity 0.5.15;
pragma experimental ABIEncoderV2;

import "../hub/Spoke.sol";
import "../shares/Shares.sol";
import "../../factory/Factory.sol";
import "../../dependencies/DSMath.sol";
import "../../engine/AmguConsumer.sol";

contract MockFeeManager is DSMath, AmguConsumer, Spoke {

    struct FeeInfo {
        address feeAddress;
        uint feeRate;
        uint feePeriod;
    }

    uint totalFees;
    uint performanceFees;

    constructor(
        address _hub,
        address _denominationAsset,
        address[] memory _fees,
        uint[] memory _periods,
        uint _rates,
        address registry
    ) Spoke(_hub) public {}

    function setTotalFeeAmount(uint _amt) public { totalFees = _amt; }
    function setPerformanceFeeAmount(uint _amt) public { performanceFees = _amt; }

    function rewardManagementFee() public { return; }
    function performanceFeeAmount() external returns (uint) { return performanceFees; }
    function totalFeeAmount() external returns (uint) { return totalFees; }
}
