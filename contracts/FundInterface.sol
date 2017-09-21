pragma solidity ^0.4.11;

import './assets/AssetInterface.sol';
import './exchange/ExchangeInterface.sol';

/// @title Fund Interface Contract
/// @author Melonport AG <team@melonport.com>
/// @notice This is to be considered as an interface on how to access the underlying Fund Contract
contract FundInterface is AssetInterface {

    // EVENTS

    event PortfolioContent(uint holdings, uint price, uint decimals);
    event SubscribeRequest(uint requestId, address indexed ofParticipant, uint atTimestamp, uint numShares);
    event RedeemRequest(uint requestId, address indexed ofParticipant, uint atTimestamp, uint numShares);
    event Subscribed(address indexed ofParticipant, uint atTimestamp, uint numShares);
    event Redeemed(address indexed ofParticipant, uint atTimestamp, uint numShares);
    event SpendingApproved(address onConsigned, address ofAsset, uint amount);
    event RewardsConverted(uint atTimestamp, uint numSharesConverted, uint unclaimed);
    event CalculationUpdate(uint atTimestamp, uint managementReward, uint performanceReward, uint nav, uint sharePrice, uint totalSupply);
    event OrderUpdated(uint id);
    event LogError(uint ERROR_CODE);

    // CONSTANT METHODS

    // Get general information
    function getModules() constant returns (address ,address, address, address) {}
    function getStake() constant returns (uint) {}
    // Get accounting specific information
    function calcGav() constant returns (uint) {}
    function calcUnclaimedRewards(uint) constant returns (uint, uint, uint) {}
    function calcNav(uint, uint) constant returns (uint) {}
    function calcValuePerShare(uint) constant returns (uint) {}
    function performCalculations() constant returns (uint, uint, uint, uint, uint, uint) {}
    function calcSharePrice() constant returns (uint) {}

    // NON-CONSTANT METHODS

    // Administration
    function increaseStake(uint numShares) external {}
    function decreaseStake(uint numShares) external {}
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
    function redeemUsingSlice(uint numShares) external {}
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
