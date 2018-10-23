pragma solidity ^0.4.21;

import "../policies/Policy.sol";
import "../Fund.sol";

// MaxPositions policy is run as a post-condition
contract MaxPositions is Policy {
    uint maxPositions;

    enum Conditionality { pre, post }

    function MaxPositions(uint _maxPositions) public {
        // _maxPositions: 10 would indicate a maximum 10 different non-quote asset tokens
        //_maxPositions = 0 would mean no non-quote asset tokens are investable
        maxPositions = _maxPositions;
    }

    function getQuoteToken() public view returns (address) {
        var (pricefeed, ,) = Fund(msg.sender).getModules();
        return CanonicalPriceFeed(pricefeed).getQuoteAsset();
    }

    function getMaxPositions() external view returns (uint) {
        return maxPositions;
    }

    // When run as a post-condition, must use "<= maxPositions"
    function rule(bytes4 sig, address[5] addresses, uint[3] values, bytes32 identifier) external view returns (bool) {

        //Always allow a trade INTO the quote asset

        if (getQuoteToken() == addresses[3]) {
          return true;
        }
        return Fund(msg.sender).getFundHoldingsLength() <= maxPositions;
    }

    //number of individual asset positions is a post-condition check
    function position() external view returns (uint) {

        //POST-condition
        return uint(Conditionality.post);
    }
}
