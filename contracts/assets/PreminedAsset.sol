pragma solidity ^0.4.11;

import "./Asset.sol";
import "../dependencies/SafeMath.sol";

/// @title PreminedAsset Contract.
/// @author Melonport AG <team@melonport.com>
/// @notice Premined amount used to make markets
contract PreminedAsset is Asset {
    using SafeMath for uint256;

    // METHODS

    function PreminedAsset(string _name, string _symbol, uint8 _decimals, uint256 _amount)
        Asset(_name, _symbol, _decimals)
    {
        balances[msg.sender] = balances[msg.sender].add(_amount);
        totalSupply = totalSupply.add(_amount);
    }

}
