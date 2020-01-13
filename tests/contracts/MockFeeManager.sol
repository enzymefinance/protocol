pragma solidity 0.6.1;
pragma experimental ABIEncoderV2;

import "main/fund/hub/Spoke.sol";
import "main/fund/shares/Shares.sol";
import "main/factory/Factory.sol";
import "main/dependencies/DSMath.sol";
import "main/engine/AmguConsumer.sol";

contract MockFeeManager is DSMath, Spoke, AmguConsumer {

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
    function engine() public view override(AmguConsumer, Spoke) returns (address) { return routes.engine; }
    function mlnToken() public view override(AmguConsumer, Spoke) returns (address) { return routes.mlnToken; }
    function priceSource() public view override(AmguConsumer, Spoke) returns (address) { return hub.priceSource(); }
    function registry() public view override(AmguConsumer, Spoke) returns (address) { return routes.registry; }
}
