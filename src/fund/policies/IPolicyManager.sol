pragma solidity 0.6.1;


interface IPolicyManagerFactory {
    function createInstance(address _hub) external returns (address);
}

