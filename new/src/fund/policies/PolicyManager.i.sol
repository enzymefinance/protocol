pragma solidity ^0.4.25;

interface PolicyManagerFactoryInterface {
    function createInstance(address _hub) public returns (address);
}
