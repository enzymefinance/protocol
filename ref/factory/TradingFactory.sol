pragma solidity ^0.4.21;


import "./Factory.i.sol";
import "../fund/trading/Trading.sol";

contract TradingFactory is FactoryInterface {
    function createInstance(address _hub, address[] _exchanges, address[] _adapters, bool[] _takesCustody) public returns (address) {
        return new Trading(_hub, _exchanges, _adapters, _takesCustody);
    }
}

