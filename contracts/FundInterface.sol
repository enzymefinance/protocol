pragma solidity ^0.4.11;

import './assets/AssetInterface.sol';
import './dependencies/ERC20.sol';
import './exchange/ExchangeInterface.sol';

/// @title Fund Interface Contract
/// @author Melonport AG <team@melonport.com>
/// @notice This is to be considered as an interface on how to access the underlying Fund Contract
contract FundInterface is AssetInterface {

    // EVENTS

    event OrderUpdated(uint id);

    // CONSTANT METHODS

    function getDataFeed() constant returns (address) {}
    function getExchangeAdapter() constant returns (address) {}
    function getDecimals() constant returns (uint) {}

    function calcGav() constant returns (uint gav) {}
    function calcValuePerShare(uint value) constant returns (uint sharePrice) {}
    function calcUnclaimedFees(uint gav) constant returns (uint managementFee, uint performanceFee, uint unclaimedFees) {}
    function calcNav(uint gav, uint unclaimedFees) constant returns (uint nav) {}
    function performCalculations() constant returns (uint, uint, uint, uint, uint, uint) {}

    function shutDown();

    // NON-CONSTANT METHODS

    function makeOrder(ERC20 haveToken, ERC20 wantToken, uint128  haveAmount, uint128  wantAmount) external  returns (uint id) {}
    function takeOrder(ExchangeInterface onExchange, uint id, uint wantedBuyAmount) external  returns (bool) {}
    function cancelOrder(ExchangeInterface onExchange, uint id) external returns (bool) {}
    function convertUnclaimedRewards() external {}

}
