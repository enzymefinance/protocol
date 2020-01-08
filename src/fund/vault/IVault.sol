pragma solidity 0.6.1;

/// @notice Custody component
interface IVault {
    function withdraw(address token, uint amount) external;
}

interface IVaultFactory {
    function createInstance(address _hub) external returns (address);
}
