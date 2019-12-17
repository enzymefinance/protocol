pragma solidity ^0.5.13;

interface IPolicyManager {
    function createInstance(address _hub) external returns (address);
}

