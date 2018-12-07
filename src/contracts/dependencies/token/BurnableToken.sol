pragma solidity ^0.4.21;

import "PreminedToken.sol";

/// @dev Just a wrapper for premined tokens which can actually be burnt
contract BurnableToken is PreminedToken {
    constructor(string _symbol, uint8 _decimals, string _name)
        public
        PreminedToken(_symbol, _decimals, _name)
    {}

    function burn(uint _amount) public {
        _burn(msg.sender, _amount);
    }
}

