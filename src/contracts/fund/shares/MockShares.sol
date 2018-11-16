pragma solidity ^0.4.21;

import "./Shares.i.sol";
import "../hub/Spoke.sol";
import "../../dependencies/token/StandardToken.sol";

/// @dev Shares can be destroyed and created by anyone (testing)
contract MockShares is Spoke, StandardToken, SharesInterface {
    string public symbol;
    string public name;
    uint8 public decimals;

    constructor(address _hub) Spoke(_hub) {
        name = hub.name();
        symbol = "MOCK";
        decimals = 18;
    }

    function createFor(address who, uint amount) {
        _mint(who, amount);
    }

    function destroyFor(address who, uint amount) {
        _burn(who, amount);
    }

    function setBalanceFor(address who, uint newBalance) {
        uint currentBalance = balances[who];
        if (currentBalance > newBalance) {
            destroyFor(who, currentBalance.sub(newBalance));
        } else if (balances[who] < newBalance) {
            createFor(who, newBalance.sub(currentBalance));
        }
    }
}

