pragma solidity ^0.4.11;

import './assets/AssetInterface.sol';
import './exchange/ExchangeInterface.sol';

/// @title Fund Interface Contract
/// @author Melonport AG <team@melonport.com>
/// @notice This is to be considered as an interface on how to access the underlying Fund Contract
contract FundInterface is AssetInterface {

    // EVENTS

    event PortfolioContent(uint holdings, uint price, uint decimals);
    event RequestUpdated(uint id);
    event Subscribed(address indexed ofParticipant, uint atTimestamp, uint numShares);
    event Redeemed(address indexed ofParticipant, uint atTimestamp, uint numShares);
    event SpendingApproved(address onConsigned, address ofAsset, uint amount);
    event RewardsConverted(uint atTimestamp, uint numSharesConverted, uint unclaimed);
    event CalculationUpdate(uint atTimestamp, uint managementReward, uint performanceReward, uint nav, uint sharePrice, uint totalSupply);
    event OrderUpdated(uint id);
    event LogError(uint ERROR_CODE);
    event ErrorMessage(string errorMessage);

    // CONSTANT METHODS

    // Get general information
    function getCreationTime() constant returns (uint) {}
    function getModules() constant returns (address ,address, address, address) {}
    function getStake() constant returns (uint) {}
    function getLastOrderId() constant returns (uint) {}
    function getLastRequestId() constant returns (uint) {}
    function noOpenOrders() internal returns (bool) {}
    function quantitySentToExchange(address ofAsset) constant returns (uint) {}
    function quantityExpectedToReturn(address ofAsset) constant returns (uint) {}
    // Get accounting information
    function performCalculations() constant returns (uint, uint, uint, uint, uint, uint) {}

    // NON-CONSTANT METHODS

    // Administration
    function increaseStake(uint numShares) external {}
    function decreaseStake(uint numShares) external {}
    function toogleSubscription() external {}
    function toggleRedemption() external {}
    function shutDown() external {}
    // Participation
    function requestSubscription(uint giveQuantity, uint shareQuantity, uint workerReward) external returns (bool, string) {}
    function requestRedemption(uint shareQuantity, uint receiveQuantity, uint workerReward) external returns (bool, string) {}
    function executeRequest(uint requestId) external {}
    function cancelRequest(uint requestId) external {}
    function redeemUsingSlice(uint numShares) external {}
    // Managing
    function makeOrder(address sellAsset, address buyAsset, uint sellQuantity, uint buyQuantity) external returns (uint) {}
    function takeOrder(uint id, uint quantity) external returns (bool) {}
    function cancelOrder(uint id) external returns (bool) {}
    function closeOpenOrders(address ofBase, address ofQuote) constant {}
    function proofOfEmbezzlement(address ofBase, address ofQuote) constant returns (bool) {}
    // Rewards
    function convertUnclaimedRewards() external {}
}
