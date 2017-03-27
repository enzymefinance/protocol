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

    Exchange exchange;

    // EVENTS

    // MODIFIERS

    // CONSTANT METHODS

    // NON-CONSTANT METHODS

    function RiskMgmt() {}

    function isTradeExecutionPermitted(
      address onExchange,
      address buy_which_token,
      address sell_which_token,
      uint quantity
    )
      returns (bool)
    {
      // TODO restrict trading depending on market impact of trade
      return true;
    }

}
