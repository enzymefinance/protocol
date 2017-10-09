pragma solidity ^0.4.11;

/// @title Version Contract
/// @author Melonport AG <team@melonport.com>
/// @notice This is to be considered as an interface on how to access the underlying Version Contract
contract VersionInterface {

      // EVENTS

      event FundUpdated(uint id);

      // CONSTANT METHODS

      function getMelonAsset() constant returns (address) {}
      function getFundById(uint withId) constant returns (address) {}
      function getLastFundId() constant returns (uint) {}
      function getFundByManager(address ofManager) constant returns (address) {}

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
