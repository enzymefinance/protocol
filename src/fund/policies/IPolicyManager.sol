pragma solidity 0.6.4;

interface IPolicyManager {
    function postValidate(bytes4, address[5] calldata, uint[3] calldata, bytes32) external;
    function preValidate(bytes4, address[5] calldata, uint[3] calldata, bytes32) external;
}

interface IPolicyManagerFactory {
    function createInstance(address _hub) external returns (address);
}

