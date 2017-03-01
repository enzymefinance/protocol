pragma solidity ^0.4.8;

import '../dependencies/ERC20.sol';

/// @title TradingProtocol Contract
/// @author Melonport AG <team@melonport.com>
/// @notice This is to be considered as a protocol on how to access the underlying Trading Contract
contract TradingProtocol {

  function offer(
      uint sell_how_much, ERC20 sell_which_token,
      uint buy_how_much,  ERC20 buy_which_token
  )
  {}

  function buy(uint id, uint quantity) {}

  function cancel(uint id) {}

}
