pragma solidity ^0.5.13;

interface PolicyManagerInterface {
    function createInstance(address _hub) external returns (address);
}
