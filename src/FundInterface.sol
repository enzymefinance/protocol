pragma solidity ^0.4.21;

/// @title Fund Interface Contract
/// @author Melonport AG <team@melonport.com>
/// @notice This is to be considered as an interface on how to access the underlying Fund Contract
interface FundInterface {

    // EVENTS

    event PortfolioContent(address[] assets, uint[] holdings, uint[] prices);
    event RequestUpdated(uint id);
    event Redeemed(address indexed ofParticipant, uint atTimestamp, uint shareQuantity);
    event FeesConverted(uint atTimestamp, uint shareQuantityConverted, uint unclaimed);
    event CalculationUpdate(uint atTimestamp, uint managementFee, uint performanceFee, uint nav, uint sharePrice, uint totalSupply);
    event ErrorMessage(string errorMessage);

    // EXTERNAL METHODS
    // Compliance by Investor
    function requestInvestment(uint giveQuantity, uint shareQuantity, address investmentAsset) external;
    function executeRequest(uint requestId) external;
    function cancelRequest(uint requestId) external;
    function redeemAllOwnedAssets(uint shareQuantity) external returns (bool);
    // Administration by Manager
    function enableInvestment(address[] ofAssets) external;
    function disableInvestment(address[] ofAssets) external;
    function shutDown() external;

    // PUBLIC METHODS
    function emergencyRedeem(uint shareQuantity, address[] requestedAssets) public returns (bool success);
    function calcSharePriceAndAllocateFees() public returns (uint);


    // PUBLIC VIEW METHODS
    // Get general information
    function getModules() view returns (address, address, address);
    function getLastRequestId() view returns (uint);
    function getManager() view returns (address);

    // Get accounting information
    function performCalculations() view returns (uint, uint, uint, uint, uint, uint, uint);
    function calcSharePrice() view returns (uint);
}
