pragma solidity ^0.4.21;


import "./Factory.i.sol";
import "../fund/fees/FeeManager.sol";

contract FeeManagerFactory is FactoryInterface {
    function createInstance(address _hub) public returns (address) {
        return new FeeManager(_hub);
    }
}

