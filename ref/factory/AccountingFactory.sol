pragma solidity ^0.4.21;


import "./Factory.i.sol";
import "../fund/accounting/Accounting.sol";

contract AccountingFactory is FactoryInterface {
    function createInstance(address _hub, address[] _controllers, address[] _defaultAssets) public returns (address) {
        return new Accounting(_hub, _controllers, _defaultAssets);
    }
}

