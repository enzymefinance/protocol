pragma solidity ^0.4.11;

/// @title ERC20 Token Interface
/// @author Melonport AG <team@melonport.com>
/// @notice See https://github.com/ethereum/EIPs/issues/20
contract ERC20Interface {

    // EVENTS

    event Transfer(address indexed _from, address indexed _to, uint256 _value);
    event Approval(address indexed _owner, address indexed _spender, uint256 _value);

    // CONSTANT METHODS

    function totalSupply() constant returns (uint256 totalSupply) {}
    function balanceOf(address _owner) constant returns (uint256 balance) {}
    function allowance(address _owner, address _spender) constant returns (uint256 remaining) {}

    // NON-CONSTANT METHODS

    function transfer(address _to, uint256 _value) returns (bool success) {}
    function transferFrom(address _from, address _to, uint256 _value) returns (bool success) {}
    function approve(address _spender, uint256 _value) returns (bool success) {}
}
