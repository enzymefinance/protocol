// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

import "./PreminedToken.sol";

/// @title Flexible ERC20 interface
/// @author Melon Council DAO <security@meloncoucil.io>
/// @dev Just a wrapper for tokens which can be burnt
abstract contract BurnableToken is PreminedToken {
    function burn(uint _amount) public {
        _burn(msg.sender, _amount);
    }

    function burnFrom(address from, uint256 value) public {
        _burnFrom(from, value);
    }
}

