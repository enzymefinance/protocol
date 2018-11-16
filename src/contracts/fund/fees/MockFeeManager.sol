pragma solidity ^0.4.21;

import "./Fee.i.sol";
import "../hub/Spoke.sol";
import "../shares/Shares.sol";
import "../../factory/Factory.sol";
import "../../dependencies/math.sol";
import "../../engine/AmguConsumer.sol";

contract MockFeeManager is DSMath, AmguConsumer, Spoke {

    constructor(address _hub) Spoke(_hub) {}

    function rewardManagementFee() { return; }
    function performanceFeeAmount() returns (uint) { return 0; }
}
