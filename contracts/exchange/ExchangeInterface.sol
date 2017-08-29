pragma solidity ^0.4.11;

import '../dependencies/ERC20.sol';

/// @title Exchange Protocol Contract
/// @author Melonport AG <team@melonport.com>
/// @notice This is to be considered as an interface on how to access the underlying Exchange Contract
contract ExchangeInterface {

    // CONSTANT METHODS

    function getLastOrderId() constant returns (uint) {}
    function isActive(uint id) constant returns (bool active) {}
    function getOwner(uint id) constant returns (address owner) {}
    function getOffer(uint id) constant returns (uint, ERC20, uint, ERC20) {}

    // NON-CONSTANT METHODS

    function make(
        ERC20    haveToken,
        ERC20    wantToken,
        uint128  haveAmount,
        uint128  wantAmount
    ) returns (uint id) {}
    function buy(uint id, uint quantity) returns (bool success) {}
    function cancel(uint id) returns (bool) {}

    // EVENTS

    event OrderUpdated(uint id);
}
