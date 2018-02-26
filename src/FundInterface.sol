pragma solidity ^0.4.19;

/// @title Fund Interface Contract
/// @author Melonport AG <team@melonport.com>
/// @notice This is to be considered as an interface on how to access the underlying Fund Contract
interface FundInterface {

    // EVENTS

    event PortfolioContent(uint holdings, uint price, uint decimals);
    event RequestUpdated(uint id);
    event Invested(address indexed ofParticipant, uint atTimestamp, uint shareQuantity);
    event Redeemed(address indexed ofParticipant, uint atTimestamp, uint shareQuantity);
    event SpendingApproved(address onConsigned, address ofAsset, uint amount);
    event FeesConverted(uint atTimestamp, uint shareQuantityConverted, uint unclaimed);
    event CalculationUpdate(uint atTimestamp, uint managementFee, uint performanceFee, uint nav, uint sharePrice, uint totalSupply);
    event OrderUpdated(uint id);
    event LogError(uint ERROR_CODE);
    event ErrorMessage(string errorMessage);

    // EXTERNAL METHODS
    // Compliance by Investor
    function requestInvestment(uint giveQuantity, uint shareQuantity, bool isNativeAsset, uint8 v, bytes32 r, bytes32 s) external;
    function requestRedemption(uint shareQuantity, uint receiveQuantity, bool isNativeAsset) external;
    function executeRequest(uint requestId) external;
    function cancelRequest(uint requestId) external;
    function redeemAllOwnedAssets(uint shareQuantity) external returns (bool);
    // Administration by Manager
    function enableInvestment() external;
    function disableInvestment() external;
    function enableRedemption() external;
    function disableRedemption() external;
    function shutDown() external;
    // Managing by Manager
    function makeOrder(uint exchangeId, address sellAsset, address buyAsset, uint sellQuantity, uint buyQuantity) external;
    function takeOrder(uint exchangeId, uint id, uint quantity) external;
    function cancelOrder(uint exchangeId, uint id) external;

    // PUBLIC METHODS
    function emergencyRedeem(uint shareQuantity, address[] requestedAssets) public returns (bool success);
    function calcSharePriceAndAllocateFees() public returns (uint);


    // PUBLIC VIEW METHODS
    // Get general information
    function getModules() view returns (address, address, address);
    function getLastOrderId() view returns (uint);
    function getLastRequestId() view returns (uint);
    function getNameHash() view returns (bytes32);
    function getManager() view returns (address);

    // Get accounting information
    function performCalculations() view returns (uint, uint, uint, uint, uint, uint, uint);
    function calcSharePrice() view returns (uint);
}
