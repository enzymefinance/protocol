pragma solidity ^0.4.11;

import '../dependencies/ERC20.sol';
import './AssetInterface.sol';

/// @title Asset Contract.
/// @author Melonport AG <team@melonport.com>
contract Asset is AssetInterface, ERC20 {

    // FIELDS

    // Constructor fields
    string public name;
    string public symbol;
    uint public decimals;

    // CONSTANT METHODS

    function getName() constant returns (string) { return name; }
    function getSymbol() constant returns (string) { return symbol; }
    function getDecimals() constant returns (uint) { return decimals; }

    // NON-CONSTANT METHODS

    function Asset(string _name, string _symbol, uint _decimals) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
    }
}
