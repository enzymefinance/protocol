pragma solidity ^0.4.21;

import "../policies/Policy.sol";
import "../Fund.sol";

// MaxPositions policy is run as a post-condition
contract MaxPositions is Policy {
    uint maxPositions;

    function MaxPositions(uint _maxPositions) public {
        // _maxPositions: 10 would indicate a maximum 10 different tokens
        maxPositions = _maxPositions;
    }

    // When run as a post-condition, must use "<= maxPositions"
    function rule(address[4] addresses, uint[2] values) external view returns (bool) {
        return Fund(msg.sender).getFundHoldingsLength() <= maxPositions;
    }

    function position() external view returns (uint) {
        return 1;
    }
}
