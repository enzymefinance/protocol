pragma solidity ^0.4.11;

import "./assets/AssetProtocol.sol";
import './dependencies/ERC20.sol';
import './exchange/ExchangeProtocol.sol';

/// @title Core Protocol Contract
/// @author Melonport AG <team@melonport.com>
/// @notice This is to be considered as a protocol on how to access the underlying Core Contract
contract CoreProtocol is AssetProtocol {

    // CONSTANT METHODS

    function getReferenceAsset() constant returns (address) {}
    function getUniverseAddress() constant returns (address) {}
    function getDecimals() constant returns (uint) {}
    function getCalculationsAtLastPayout() constant returns (uint, uint, uint, uint, uint) {}
    function calcGav() constant returns (uint gav) {}
    function calcValuePerShare(uint value) constant returns (uint sharePrice) {}
    function calcUnclaimedFees(uint gav) constant returns (uint managementFee, uint performanceFee, uint unclaimedFees) {}
    function calcNav(uint gav, uint unclaimedFees) constant returns (uint nav) {}
    function performCalculations() constant returns (uint, uint, uint, uint, uint, uint) {}

    // NON-CONSTANT METHODS

    function createShares(uint shareAmount) { createSharesOnBehalf(msg.sender, shareAmount); }
    function annihilateShares(uint shareAmount) { annihilateSharesOnBehalf(msg.sender, shareAmount); }
    function createSharesOnBehalf(address recipient, uint shareAmount) {}
    function annihilateSharesOnBehalf(address recipient, uint shareAmount) {}
    function makeOrder(ExchangeProtocol onExchange,
        uint sell_how_much, ERC20 sell_which_token,
        uint buy_how_much,  ERC20 buy_which_token
    )
        returns (uint id)
    {}
    function takeOrder(ExchangeProtocol onExchange, uint id, uint wantedBuyAmount) returns (bool) {}
    function cancelOrder(ExchangeProtocol onExchange, uint id) returns (bool) {}
    function convertUnclaimedFees() {}

    // EVENTS

    event OrderUpdate(uint id);
}
