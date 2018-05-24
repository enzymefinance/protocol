pragma solidity ^0.4.21;

/// @title Interface for ERC223 token contract
/// @notice Adapted from https://git.io/vNyA0

interface ERC223Interface {
    function balanceOf(address who) constant returns (uint);
    function transfer(address to, uint value) returns (bool);
    function transfer(address to, uint value, bytes data) returns (bool);
    event Transfer(address indexed from, address indexed to, uint value, bytes data);
}
