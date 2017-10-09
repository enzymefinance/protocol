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
    event Subscribed(address indexed ofParticipant, uint atTimestamp, uint shareQuantity);
    event Redeemed(address indexed ofParticipant, uint atTimestamp, uint shareQuantity);
    event SpendingApproved(address onConsigned, address ofAsset, uint amount);
    event RewardsConverted(uint atTimestamp, uint shareQuantityConverted, uint unclaimed);
    event CalculationUpdate(uint atTimestamp, uint managementReward, uint performanceReward, uint nav, uint sharePrice, uint totalSupply);
    event OrderUpdated(uint id);
    event LogError(uint ERROR_CODE);
    event ErrorMessage(string errorMessage);

    // CONSTANT METHODS

    // Get general information
    function getCreationTime() constant returns (uint) {}
    function getBaseUnits() constant returns (uint) {}
    function getModules() constant returns (address ,address, address, address) {}
    function getStake() constant returns (uint) {}
    function getLastOrderId() constant returns (uint) {}
    function getLastRequestId() constant returns (uint) {}
    // Get staking information
    function quantitySentToExchange(address ofAsset) constant returns (uint) {}
    function quantityExpectedToReturn(address ofAsset) constant returns (uint) {}
    // Get accounting information
    function performCalculations() constant returns (uint, uint, uint, uint, uint, uint) {}
    function calcSharePrice() constant returns (uint) {}

    // NON-CONSTANT METHODS

    // Participation by Investor
    function requestSubscription(uint giveQuantity, uint shareQuantity, uint workerReward) external returns (bool, string) {}
    function requestRedemption(uint shareQuantity, uint receiveQuantity, uint workerReward) external returns (bool, string) {}
    function executeRequest(uint requestId) external returns (bool, string) {}
    function cancelRequest(uint requestId) external returns (bool, string) {}
    function redeemUsingSlice(uint shareQuantity) external returns (bool, string) {}
    // Administration by Manager
    function toogleSubscription() external {}
    function toggleRedemption() external {}
    function shutDown() {}
    // Participation
    function requestSubscription(
        uint numShares,
        uint offeredValue,
        uint incentiveValue
    ) external returns(uint) {}
    function requestRedemption(
        uint numShares,
        uint requestedValue,
        uint incentiveValue
    ) external returns (uint) {}
    function executeRequest(uint requestId) external {}
    function cancelRequest(uint requestId) external {}
    function redeemOwnedAssets(uint numShares) external {}
    // Managing
    function makeOrder(
        address sellAsset,
        address buyAsset,
        uint sellQuantity,
        uint buyQuantity
    ) external returns (uint) {}
    function takeOrder(uint id, uint quantity) external returns (bool) {}
    function cancelOrder(uint id) external returns (bool) {}
    function closeOpenOrders(address ofBase, address ofQuote) constant {}
    function proofOfEmbezzlement(address ofBase, address ofQuote) constant returns (bool) {}
    // Rewards
    function convertUnclaimedRewards() external {}
}
