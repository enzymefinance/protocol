pragma solidity ^0.4.4;

import "../dependencies/ERC20.sol";

/// @title Premine Token Contract.
/// @author Melonport AG <team@melonport.com>
/// @notice Premined amount used to make markets
contract PreminedToken is ERC20 {

    // FIELDS

    string public name;
    string public symbol;
    uint public precision;

    // METHODS

    function PreminedToken(string _name, string _symbol, uint _precision) {
        name = _name; // Set the name for display purposes
        symbol = _symbol; // Set the symbol for display purposes
        precision = _precision; // Defined in price feed protocol
        balances[msg.sender] = 10**7; // Premine amount
    }
}
