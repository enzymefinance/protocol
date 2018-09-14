pragma solidity ^0.4.21;

import "../pricefeeds/CanonicalPriceFeed.sol";
import "../dependencies/math.sol";
import "../policies/Policy.sol";
import "../Fund.sol";

// MaxConcentration policy is run as a post-condition
contract MaxConcentration is DSMath, Policy {
    uint256 private maxConcentration;

    enum Conditionality { pre, post }


    // _maxConcentration: 10 equals to 10% of Fund Value
    function MaxConcentration(uint256 _maxConcentration) public {
        require(_maxConcentration <= 100);
        require(_maxConcentration > 0);
        maxConcentration = _maxConcentration ** uint256(17);
    }

    function getMaxConcentration() external view returns (uint256) {
        return maxConcentration;
    }

    function getQuoteToken() public view returns (address) {
        var (pricefeed, ,) = Fund(msg.sender).getModules();
        return CanonicalPriceFeed(pricefeed).getQuoteAsset();
    }

    // When run as a post-condition, must use "<= maxPositions"
    function rule(bytes4 sig, address[5] addresses, uint[3] values, bytes32 identifier) external view returns (bool) {
        // Max concentration is only checked for assets different from the quote token (WETH)
        if (getQuoteToken() == addresses[3]) {
            return true;
        }

        return (Fund(msg.sender).calcAssetGAV(addresses[3]) * (10 ** uint(18))) / Fund(msg.sender).calcGav() <= maxConcentration;
    }

    //asset concentration is a post-condition check
    function position() external view returns (uint) {

        //POST-condition
        return uint(Conditionality.post);
    }
}
