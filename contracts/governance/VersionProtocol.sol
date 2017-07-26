pragma solidity ^0.4.11;

/// @title Version Protocol Contract
/// @author Melonport AG <team@melonport.com>
/// @notice This is to be considered as a protocol on how to access the underlying Version Contract
contract VersionProtocol {
  function numCreatedVaults() constant returns (uint) {}
  function getVault(uint id) constant returns (address) {}
  function setupVault(
      string withName,
      string withSymbol,
      uint withDecimals,
      address ofUniverse,
      address ofParticipation,
      address ofRiskMgmt,
      address ofRewards
  )
    returns (uint id)
  {}
  function decommissionVault(uint id) {}
}
