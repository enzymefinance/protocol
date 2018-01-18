pragma solidity ^0.4.19;

/// @title Fund Interface Contract
/// @author Melonport AG <team@melonport.com>
/// @notice This is to be considered as an interface on how to access the underlying Fund Contract
interface FundInterface {

    // EVENTS

    event PortfolioContent(uint holdings, uint price, uint decimals);
    event RequestUpdated(uint id);
    event Subscribed(address indexed ofParticipant, uint atTimestamp, uint shareQuantity);
    event Redeemed(address indexed ofParticipant, uint atTimestamp, uint shareQuantity);
    event SpendingApproved(address onConsigned, address ofAsset, uint amount);
    event RewardsConverted(uint atTimestamp, uint shareQuantityConverted, uint unclaimed);
    event CalculationUpdate(uint atTimestamp, uint managementReward, uint performanceReward, uint nav, uint sharePrice, uint totalSupply);
    event OrderUpdated(uint id);
    event LogError(uint ERROR_CODE);
    event ErrorMessage(string errorMessage);

    // EXTERNAL METHODS
    // Compliance by Investor
    function requestSubscription(uint giveQuantity, uint shareQuantity, bool isNativeAsset) external;
    function requestRedemption(uint shareQuantity, uint receiveQuantity, bool isNativeAsset) external;
    function executeRequest(uint requestId) external;
    function cancelRequest(uint requestId) external;
    function redeemAllOwnedAssets(uint shareQuantity) external returns (bool);
    // Administration by Manager
    function enableSubscription() external;
    function disableSubscription() external;
    function enableRedemption() external;
    function disableRedemption() external;
    function shutDown() external;
    // Managing by Manager
    function makeOrder(uint exchangeId, address sellAsset, address buyAsset, uint sellQuantity, uint buyQuantity) external;
    function takeOrder(uint exchangeId, uint id, uint quantity) external;
    function cancelOrder(uint exchangeId, uint id) external;

    // PUBLIC METHODS
    function emergencyRedeem(uint shareQuantity, address[] requestedAssets) public returns (bool success);
    // Rewards by Manager
    function allocateUnclaimedRewards();

    // PUBLIC VIEW METHODS
    // Get general information
    function getModules() constant returns (address, address[], address, address);
    function getLastOrderId() constant returns (uint);
    function getLastRequestId() constant returns (uint);
    function getNameHash() constant returns (bytes32);

    // Get accounting information
    function performCalculations() constant returns (uint, uint, uint, uint, uint, uint, uint);
    function calcSharePrice() constant returns (uint);
}
