pragma solidity 0.5.15;


interface IPolicyManagerFactory {
    function createInstance(address _hub) external returns (address);
}

