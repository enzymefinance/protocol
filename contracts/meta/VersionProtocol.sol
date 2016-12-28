pragma solidity ^0.4.4;

/// @title Version Protocol Contract
/// @author Melonport AG <team@melonport.com>
/// @notice This is to be considered as a protocol on how to access the underlying Version Contract
contract VersionProtocol {

  function numCreatedCores() constant returns (uint) {}
  function coreAt(uint index) constant returns (address) {}
  function createCore(address ofRegistrar, address ofTrading, address ofManagmentFee, address ofPerformanceFee) returns (address) {}

}
