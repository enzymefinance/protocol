pragma solidity ^0.4.11;

import "./RiskMgmtProtocol.sol";

/// @title RiskMgmt Contract
/// @author Melonport AG <team@melonport.com>
contract RiskMgmt is SafeMath, Owned {

    // FIELDS

    // EVENTS

    // MODIFIERS

    // CONSTANT METHODS

    // NON-CONSTANT METHODS

    function isExchangeMakePermitted(
        address onExchange,
        uint sell_how_much, ERC20 sell_which_token,
        uint buy_how_much,  ERC20 buy_which_token
    )
        returns (bool)
    {
        return true; // For testing purposes
    }

    function isExchangeTakePermitted(
        address onExchange,
        uint sell_how_much, ERC20 sell_which_token,
        uint buy_how_much,  ERC20 buy_which_token,
        address orderOwner
    )
        returns (bool)
    {
        return true; // For testing purposes
    }
}
