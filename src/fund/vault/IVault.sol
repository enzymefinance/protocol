pragma solidity 0.5.15;

/// @notice Custody component
interface IVault {
    function withdraw(address token, uint amount) external;
}

interface IVaultFactory {
    function createInstance(address _hub) external returns (address);
}
