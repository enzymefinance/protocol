pragma solidity ^0.4.8;

import '../dependencies/ERC20.sol';

/// @title RiskMgmtProtocol Contract
/// @author Melonport AG <team@melonport.com>
/// @notice This is to be considered as a protocol on how to access the underlying RiskMgmt Contract
contract RiskMgmtProtocol {

  function isTradeExecutionPermitted(
    address onExchange,
    address buy_which_token,
    address sell_which_token,
    uint quantity
  )
    returns (bool)
  {}

}
