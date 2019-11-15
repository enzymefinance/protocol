pragma solidity ^0.4.25;

interface PolicyManagerInterface {
    function createInstance(address _hub) public returns (address);
}
