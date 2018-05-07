pragma solidity ^0.4.21;

/// @title Version Contract
/// @author Melonport AG <team@melonport.com>
/// @notice This is to be considered as an interface on how to access the underlying Version Contract
interface VersionInterface {

    // EVENTS

    event FundUpdated(uint id);

    // PUBLIC METHODS

    function shutDown() external;

    function setupFund(
        bytes32 ofFundName,
        address ofQuoteAsset,
        uint ofManagementFee,
        uint ofPerformanceFee,
        address ofCompliance,
        address ofRiskMgmt,
        address[] ofExchanges,
        address[] ofDefaultAssets,
        uint8 v,
        bytes32 r,
        bytes32 s
    );
    function shutDownFund(address ofFund);

    // PUBLIC VIEW METHODS

    function getNativeAsset() view returns (address);
    function getFundById(uint withId) view returns (address);
    function getLastFundId() view returns (uint);
    function getFundByManager(address ofManager) view returns (address);
    function termsAndConditionsAreSigned(uint8 v, bytes32 r, bytes32 s) view returns (bool signed);

}
