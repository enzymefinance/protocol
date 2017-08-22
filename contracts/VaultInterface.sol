pragma solidity ^0.4.11;

import './assets/AssetInterface.sol';
import './dependencies/ERC20.sol';
import './exchange/ExchangeInterface.sol';

/// @title Vault Protocol Contract
/// @author Melonport AG <team@melonport.com>
/// @notice This is to be considered as an interface on how to access the underlying Vault Contract
contract VaultInterface is AssetInterface {

    // CONSTANT METHODS

    function getDataFeedAddress() constant returns (address) {}
    function getExchangeAddress() constant returns (address) {}
    function getDecimals() constant returns (uint) {}
    function getCalculationsAtLastPayout() constant returns (uint, uint, uint, uint, uint) {}
    function getSliceForNumShares(uint numShares) constant returns (address[200] assets, uint[200] amounts, uint numAssets) {}
    function getBaseUnitsPerShare() constant returns (uint) {}
    function getRefPriceForNumShares(uint numShares) constant returns (uint priceInRef) {}
    function calcGav() constant returns (uint gav) {}
    function calcValuePerShare(uint value) constant returns (uint sharePrice) {}
    function calcUnclaimedFees(uint gav) constant returns (uint managementFee, uint performanceFee, uint unclaimedFees) {}
    function calcNav(uint gav, uint unclaimedFees) constant returns (uint nav) {}
    function performCalculations() constant returns (uint, uint, uint, uint, uint, uint) {}

    // NON-CONSTANT METHODS

    function createShares(uint shareAmount) {}
    function annihilateShares(uint shareAmount) {}
    function createSharesOnBehalf(address recipient, uint shareAmount) {}
    function annihilateSharesOnBehalf(address recipient, uint shareAmount) {}
    function makeOrder(ExchangeInterface onExchange,
        uint sell_how_much, ERC20 sell_which_token,
        uint buy_how_much,  ERC20 buy_which_token
    )
        returns (uint id) {}
    function takeOrder(ExchangeInterface onExchange, uint id, uint wantedBuyAmount) returns (bool) {}
    function cancelOrder(ExchangeInterface onExchange, uint id) returns (bool) {}
    function convertUnclaimedRewards() {}

    // EVENTS

    event OrderUpdated(uint id);
}
