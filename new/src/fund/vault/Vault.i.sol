pragma solidity ^0.4.25;

/// @notice Custody component
interface VaultInterface {
    function withdraw(address token, uint amount) external;
}

interface VaultFactoryInterface {
    function createInstance(address _hub) external returns (address);
}
