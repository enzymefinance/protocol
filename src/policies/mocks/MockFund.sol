pragma solidity ^0.4.21;

import "../../pricefeeds/CanonicalPriceFeed.sol";
import "../Manager.sol";

contract MockFund is PolicyManager {
    struct Modules {
        CanonicalPriceFeed pricefeed;
    }

    Modules public modules;

    function setPriceFeed(address _pricefeed) public {
        modules.pricefeed = CanonicalPriceFeed(_pricefeed);
    }

    function testPolicy(address[4] addresses, uint[2] values) public view 
        validPolicy(addresses, values) 
    {
        // dummy
    }
}
