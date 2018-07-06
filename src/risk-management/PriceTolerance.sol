pragma solidity ^0.4.21;

import "../dependencies/math.sol";
import "../policies/Policy.sol";
import "../Fund.sol";

contract PriceTolerance is DSMath, Policy {
    uint256 tolerance;

    // _tolerance: 10 equals to 10% of tolerance
    function PriceTolerance(uint256 _tolerance) public {
        tolerance = _tolerance ** uint256(17);
    }

    function getPrice(address _asset) internal returns (uint) {
        var (pricefeed, ,) = Fund(this).modules();
        var (price, ) = pricefeed.getPrice(_asset);

        return price;
    }

    function rule(address[4] addresses, uint[2] values) external view returns (bool) {
        uint price = getPrice(addresses[3]);
        return values[1] < sub(price, wmul(tolerance, price));
    }
}
