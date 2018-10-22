pragma solidity ^0.4.21;

import "./StandardToken.sol";

/// @dev Just a wrapper for tokens which can actually be burnt
contract BurnableToken is StandardToken {
    function burn(uint256 _amount) public {
        _burn(msg.sender, _amount);
    }
}

