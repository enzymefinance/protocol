pragma solidity ^0.4.4;

/// @title Asset Protocol Contract
/// @author Melonport AG <team@melonport.com>
/// @notice This is to be considered as a protocol on how to access the underlying Asset Contract
contract AssetProtocol {

  function getName() constant returns (string) {}
  function getSymbol() constant returns (string) {}
  function getPrecision() constant returns (uint) {}

}
