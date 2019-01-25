pragma solidity ^0.4.21;

/// @notice Custody component
interface VaultInterface {
    function withdraw(address token, uint amount) external;
}

