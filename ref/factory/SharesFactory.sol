pragma solidity ^0.4.21;


import "./Factory.i.sol";
import "../fund/shares/Shares.sol";

contract SharesFactory is FactoryInterface {
    function createInstance(address _hub, address[] _controllers) public returns (address) {
        return new Shares(_hub, _controllers);
    }
}

