pragma solidity ^0.4.19;

import '../dependencies/ERC20Token.sol';
import './AssetInterface.sol';

/// @title Asset Contract for creating ERC20 compliant assets.
/// @author Melonport AG <team@melonport.com>
contract Asset is AssetInterface, ERC20Token {

    // FIELDS

    // Constructor fields
    string public name;
    string public symbol;
    uint public decimals;

    // NON-CONSTANT METHODS

    function Asset(string _name, string _symbol, uint _decimals) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
    }
}
