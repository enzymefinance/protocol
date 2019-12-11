pragma solidity ^0.5.13;

interface PolicyManagerFactoryInterface {
    function createInstance(address _hub) public returns (address);
}
