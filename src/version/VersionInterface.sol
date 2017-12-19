pragma solidity ^0.4.19;

/// @title Version Contract
/// @author Melonport AG <team@melonport.com>
/// @notice This is to be considered as an interface on how to access the underlying Version Contract
contract VersionInterface {

    // EVENTS

    event FundUpdated(uint id);

    // PUBLIC METHODS

    function shutDown() external {}

    function setupFund(
        string withName,
        string withSymbol,
        uint withDecimals,
        uint ofManagementRewardRate,
        uint ofPerformanceRewardRate,
        address ofCompliance,
        address ofRiskMgmt,
        address[] ofExchanges,
        address[] ofExchangeAdapters
    ) {}
    function shutDownFund(uint id) {}

    // PUBLIC VIEW METHODS

    function getMelonAsset() constant returns (address) {}
    function getFundById(uint withId) constant returns (address) {}
    function getLastFundId() constant returns (uint) {}
    function getFundByManager(address ofManager) constant returns (address) {}
    function termsAndConditionsAreSigned(uint8 v, bytes32 r, bytes32 s) view returns (bool signed) {}

}
