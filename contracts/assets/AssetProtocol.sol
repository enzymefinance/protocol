pragma solidity ^0.4.11;

import "../dependencies/ERC20Protocol.sol";

/// @title Asset Protocol Contract
/// @author Melonport AG <team@melonport.com>
/// @notice This is to be considered as a protocol on how to access the underlying Asset Contract
/// @notice This extends the ERC20 Protocol
contract AssetProtocol is ERC20Protocol {

  function getName() constant returns (string) {}
  function getSymbol() constant returns (string) {}
  function getDecimals() constant returns (uint) {}

}
