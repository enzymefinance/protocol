pragma solidity ^0.4.11;

/// @title Version Contract
/// @author Melonport AG <team@melonport.com>
/// @notice This is to be considered as an interface on how to access the underlying Version Contract
contract VersionInterface {

      // EVENTS

      event FundAdded(address fundAddr, uint id, string name, uint256 atTime);
      event FundUpdated(uint id);

      // CONSTANT METHODS

      function getFund(uint id) constant returns (address) {}
      function fundForManager(address ofManager) constant returns (address) {}
      function getMelonAsset() constant returns (address) {}
      function getNextFundId() constant returns (uint) {}
      function getLastFundId() constant returns (uint) {}

      // NON-CONSTANT METHODS

      function setupFund(
          string withName,
          string withSymbol,
          uint withDecimals,
          uint ofManagementRewardRate,
          uint ofPerformanceRewardRate,
          address ofParticipation,
          address ofRiskMgmt,
          address ofSphere
      ) {}
      function shutDownFund(uint id) {}
}
