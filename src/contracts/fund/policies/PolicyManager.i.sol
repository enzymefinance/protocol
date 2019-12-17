pragma solidity ^0.5.13;


interface IPolicyManagerFactory {
    function createInstance(address _hub) external returns (address);
}

