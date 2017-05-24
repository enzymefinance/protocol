pragma solidity ^0.4.11;

import "./RiskMgmtProtocol.sol";
import "../exchange/Exchange.sol";
import '../dependencies/ERC20.sol';
import '../dependencies/SafeMath.sol';
import "../dependencies/Owned.sol";

/// @title RiskMgmt Contract
/// @author Melonport AG <team@melonport.com>
contract RiskMgmt is SafeMath, Owned {

    // FIELDS

    // EVENTS

    // MODIFIERS

    // CONSTANT METHODS

    // NON-CONSTANT METHODS

    /* Remark: Checks for:
     *  1) Liquidity: All positions have to be fairly simple to liquidate.
     *    E.g. Cap at percentage of 30 day average trading volume of this pair
     *  2) Market Impact: If w/in above liquidity restrictions, trade size also
     *    restricted to have market impact below certain threshold
     */
    function isExchangeMakePermitted(
        address onExchange,
        uint sell_how_much, ERC20 sell_which_token,
        uint buy_how_much,  ERC20 buy_which_token
    )
        returns (bool)
    {
        // For testing purposes
        return true;
    }

    /* Remark: Checks for:
     *  1) Liquidity: All positions have to be fairly simple to liquidate.
     *    E.g. Cap at percentage of 30 day average trading volume of this pair
     *  2) Market Impact: If w/in above liquidity restrictions, trade size also
     *    restricted to have market impact below certain threshold
     */
    function isExchangeTakePermitted(
        address onExchange,
        uint sell_how_much, ERC20 sell_which_token,
        uint buy_how_much,  ERC20 buy_which_token,
        address orderOwner
    )
        returns (bool)
    {
        // For testing purposes
        return true;
    }
}
