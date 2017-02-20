pragma solidity ^0.4.4;

import "../dependencies/ERC20.sol";

/// @title Asset Contract.
/// @author Melonport AG <team@melonport.com>
contract Asset is ERC20 {

    // FIELDS

    // Constant token specific fields
    string public name;
    string public symbol;
    uint public precision;

    // CONSTANT METHODS

    function getName() constant returns (string) { return name; }

    function getSymbol() constant returns (string) { return symbol; }

    function getPrecision() constant returns (uint) { return precision; }

    // NON-CONSTANT METHODS

    function Asset(string _name, string _symbol, uint _precision) {
        name = _name; // Set the name for display purposes
        symbol = _symbol; // Set the symbol for display purposes
        precision = _precision; // Defined in price feed protocol
    }
}
