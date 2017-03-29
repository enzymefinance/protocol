pragma solidity ^0.4.8;

import "./RiskMgmtProtocol.sol";
import "../exchange/Exchange.sol";
import '../dependencies/ERC20.sol';
import '../dependencies/SafeMath.sol';
import "../dependencies/Owned.sol";

/// @title RiskMgmt Contract
/// @author Melonport AG <team@melonport.com>
contract RiskMgmt is RiskMgmtProtocol, SafeMath, Owned {

    // FIELDS

    // EVENTS

    // MODIFIERS

    // CONSTANT METHODS

    // NON-CONSTANT METHODS

    function RiskMgmt() {}

    function isExchangeOfferPermitted(
        address onExchange,
        uint sell_how_much, ERC20 sell_which_token,
        uint buy_how_much,  ERC20 buy_which_token
    )
        returns (bool)
    {
        // TODO restrict trading depending on market impact of trade
        return true;
    }

    function isExchangeBuyPermitted(
        address onExchange,
        uint sell_how_much, ERC20 sell_which_token,
        uint buy_how_much,  ERC20 buy_which_token
    )
        returns (bool)
    {
        // TODO restrict trading depending on market impact of trade
        return true;
    }
}
