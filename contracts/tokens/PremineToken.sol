pragma solidity ^0.4.4;

import "../dependencies/ERC20.sol";
import "../dependencies/SafeMath.sol";

/// @title Premine Token Contract.
/// @author Melonport AG <team@melonport.com>
/// @notice Premined amount used to make markets
contract PremineToken is ERC20, SafeMath {

    // FIELDS

    // Constant token specific fields
    string public name;
    string public symbol;
    uint public precision;

    // METHODS

    function PremineToken(string _name, string _symbol, uint _precision, uint _amount) {
        name = _name; // Set the name for display purposes
        symbol = _symbol; // Set the symbol for display purposes
        precision = _precision; // Defined in price feed protocol
        balances[msg.sender] = safeAdd(balances[msg.sender], _amount);
        totalSupply = safeAdd(totalSupply, _amount);
    }
}
