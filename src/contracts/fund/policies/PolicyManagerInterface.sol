pragma solidity 0.5.15;

interface IPolicyManager {
    function createInstance(address _hub) external returns (address);
}

