pragma solidity ^0.4.21;


/// @notice Custody component
interface VaultInterface {
    function deposit(address token, uint amount);
    function withdraw(address token, uint amount);
    function lockdown();
    function unlock();
}

