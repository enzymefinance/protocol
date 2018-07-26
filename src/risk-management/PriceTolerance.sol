pragma solidity ^0.4.21;

import "../dependencies/math.sol";
import "../pricefeeds/SimplePriceFeedInterface.sol";
import "../policies/Policy.sol";
import "../Fund.sol";

contract PriceTolerance is DSMath, Policy {
    uint256 tolerance;

    // _tolerance: 10 equals to 10% of tolerance
    function PriceTolerance(uint256 _tolerance) public {
        tolerance = _tolerance ** uint256(17);
    }

    function getPriceRatio(address _base, address _quote) public view returns (uint, uint, uint) {
        var (pricefeed, ,) = Fund(msg.sender).getModules();

        var (base, )    = SimplePriceFeedInterface(pricefeed).getPrice(_base);
        var (quote, )   = SimplePriceFeedInterface(pricefeed).getPrice(_quote);

        return (base, quote, wdiv(base, quote));
    }

    function abs(int _val) internal view returns (uint) {
        if (_val < 0) {
            return uint(-1 * _val);
        } else {
            return uint(_val);
        }
    }

    function apply(address _base, address _quote, uint _value) public view returns (uint, uint, uint, uint, uint, uint, bool) {
        var (base, quote, ratio) = getPriceRatio(_base, _quote);

        /*
        int res = int(ratio) - int(_value);
        uint x;
        if (res < 0) {  // Absolute value
            x = uint(-1 * res);
        } else {
            x = uint(res);
        }

        return (ratio, _value, res, x, wdiv(x, ratio));
        */

        uint res = abs(int(ratio) - int(_value));
        uint aux = wdiv(res, ratio);

        return (base, quote, ratio, _value, res, aux, aux <= tolerance);
    }
    
    function rule(address[4] addresses, uint[2] values) external view returns (bool) {
        var (,, ratio) = getPriceRatio(addresses[2], addresses[3]);
        
        uint value = values[0] / values[1];
        uint res = abs(int(ratio) - int(value));
        uint aux = wdiv(res, ratio);

        return aux <= tolerance;
    }

    function position() external view returns (uint) {
        return 0;
    }
}
