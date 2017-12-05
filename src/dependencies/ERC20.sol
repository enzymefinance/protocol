pragma solidity ^0.4.19;

import './ERC20Interface.sol';
import '../libraries/safeMath.sol';

/// @title ERC20 Token
/// @author Melonport AG <team@melonport.com>
/// @notice Original taken from https://github.com/ethereum/EIPs/issues/20
/// @notice Checked against integer overflow
contract ERC20 is ERC20Interface {
    using safeMath for uint;

    function transfer(address _to, uint256 _value) returns (bool success) {
        require(balances[msg.sender] >= _value && balances[_to].add(_value) > balances[_to]);
        balances[msg.sender] = balances[msg.sender].sub(_value);
        balances[_to] = balances[_to].add(_value);
        Transfer(msg.sender, _to, _value);
        return true;
    }

    function transferFrom(address _from, address _to, uint256 _value) returns (bool success) {
        require(balances[_from] >= _value && allowed[_from][msg.sender] >= _value && balances[_to].add(_value) > balances[_to]);
        balances[_to] = balances[_to].add(_value);
        balances[_from] = balances[_from].sub(_value);
        allowed[_from][msg.sender] = allowed[_from][msg.sender].sub(_value);
        Transfer(_from, _to, _value);
        return true;
    }

    function balanceOf(address _owner) constant returns (uint256 balance) {
        return balances[_owner];
    }

    function approve(address _spender, uint256 _value) returns (bool success) {
        allowed[msg.sender][_spender] = _value;
        Approval(msg.sender, _spender, _value);
        return true;
    }

    function allowance(address _owner, address _spender) constant returns (uint256 remaining) {
        return allowed[_owner][_spender];
    }

    mapping (address => uint256) balances;

    mapping (address => mapping (address => uint256)) allowed;

    uint256 public totalSupply;

}
