pragma solidity ^0.4.11;

/// @title Version Protocol Contract
/// @author Melonport AG <team@melonport.com>
/// @notice This is to be considered as a protocol on how to access the underlying Version Contract
contract VersionProtocol {
  function numCreatedCores() constant returns (uint) {}
  function getCore(uint atIndex) constant returns (address) {}
  function createCore(
      string withName,
      address ofUniverse,
      address ofSubscribe,
      address ofRedeem,
      address ofRiskMgmt,
      address ofManagmentFee,
      address ofPerformanceFee
  )
      returns (address)
  {}
}
