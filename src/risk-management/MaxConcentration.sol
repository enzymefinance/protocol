pragma solidity ^0.4.21;

import "../dependencies/math.sol";
import "../policies/Policy.sol";
import "../Fund.sol";

// MaxConcentration policy is run as a post-condition
contract MaxConcentration is DSMath, Policy {
    uint256 private maxConcentration;

    // _maxConcentration: 100000000000000000 equals to 10% of Fund Value
    function MaxConcentration(uint256 _maxConcentration) public {
      maxConcentration = _maxConcentration;
    }

    function getMaxConcentration() public view returns (uint256) {
      return maxConcentration;
    }

    // When run as a post-condition, must use "<= maxPositions"
    function rule(address[4] addresses, uint[2] values) external view returns (bool) {
      return (Fund(msg.sender).calcAssetGAV(addresses[3])*(10 ** uint(18)))/Fund(msg.sender).calcGav() <= maxConcentration;
    }
}
