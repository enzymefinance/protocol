pragma solidity ^0.4.11;

import "./RiskMgmtProtocol.sol";

/// @title RiskMgmt Contract
/// @author Melonport AG <team@melonport.com>
contract RiskMgmtV1 is RiskMgmtProtocol {

      // FIELDS

      address public constant LIQUIDITY_PROVIDER = 0x00E0B33cDb3AF8B55CD8467d6d13BC0Ba8035acF;

      // NON-CONSTANT METHODS

      function isExchangeMakePermitted(
          address onExchange,
          uint sell_how_much, ERC20 sell_which_token,
          uint buy_how_much,  ERC20 buy_which_token
      )
          returns (bool)
      {
          return false; // Inital version of risk management does not allow to make orders
      }

      function isExchangeTakePermitted(
          address onExchange,
          uint sell_how_much, ERC20 sell_which_token,
          uint buy_how_much,  ERC20 buy_which_token,
          address orderOwner
      )
          returns (bool)
      {
          return orderOwner == LIQUIDITY_PROVIDER; // Inital version of risk management restricts trading to liquidity provider
      }
}
