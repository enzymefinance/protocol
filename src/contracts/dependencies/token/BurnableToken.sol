pragma solidity ^0.5.13;

import "./PreminedToken.sol";

/// @dev Just a wrapper for premined tokens which can actually be burnt
contract BurnableToken is PreminedToken {
    constructor(string _symbol, uint8 _decimals, string _name)
        public
        PreminedToken(_symbol, _decimals, _name)
    {}

    function burn(uint _amount) public {
        _burn(msg.sender, _amount);
    }
    
    function burnFrom(address from, uint256 value) public {
        _burnFrom(from, value);
    }
}

