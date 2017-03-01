pragma solidity ^0.4.8;

import "./Asset.sol";
import "../dependencies/SafeMath.sol";

/// @title PreminedAsset Contract.
/// @author Melonport AG <team@melonport.com>
/// @notice Premined amount used to make markets
contract PreminedAsset is Asset, SafeMath {

    // FIELDS

    // Constant token specific fields
    string public name;
    string public symbol;
    uint public decimals;

    // METHODS

    function PreminedAsset(string _name, string _symbol, uint _decimals, uint _amount)
        Asset(_name, _symbol, _decimals)
    {
        balances[msg.sender] = safeAdd(balances[msg.sender], _amount);
        totalSupply = safeAdd(totalSupply, _amount);
    }
}
