pragma solidity ^0.4.11;

import "./RiskMgmtProtocol.sol";
import "../exchange/Exchange.sol";
import '../dependencies/ERC20.sol';
import '../dependencies/SafeMath.sol';
import "../dependencies/Owned.sol";

/// @title RiskMgmt Contract
/// @author Melonport AG <team@melonport.com>
contract RiskMgmtV1 is RiskMgmtProtocol {

      // FIELDS

      address public constant LIQUIDITY_PROVIDER = 0x00E0B33cDb3AF8B55CD8467d6d13BC0Ba8035acF;

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
          // Inital version of risk management does not allow to make orders
          return false;
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
          // Inital version of risk management restricts trading to liquidity provider
          return orderOwner == LIQUIDITY_PROVIDER;
      }
}
