pragma solidity ^0.4.11;

import '../dependencies/ERC20.sol';

/// @title Exchange Protocol Contract
/// @author Melonport AG <team@melonport.com>
/// @notice This is to be considered as an interface on how to access the underlying Exchange Contract
/// @notice Interface inspired by
///   https://github.com/makerdao/maker-otc/blob/master/src/simple_market.sol and
///   https://github.com/0xProject/contracts/blob/master/contracts/Exchange.sol
contract ExchangeInterface {

    // CONSTANT METHODS

    function getLastOrderId() constant returns (uint) {}
    function isActive(uint id) constant returns (bool active) {}
    function getOwner(uint id) constant returns (address owner) {}
    function getOffer(uint id) constant returns (uint, ERC20, uint, ERC20) {}

    // NON-CONSTANT METHODS

    function make(
        address sellAsset,
        address buyAsset,
        uint sellQuantity,
        uint buyQuantity
    ) returns (uint id) {}
    function buy(uint id, uint quantity) returns (bool success) {}
    function cancel(uint id) returns (bool) {}

    // EVENTS

    event Updated(uint id);
    event Traded(
        address indexed sellAsset,
        address indexed buyAsset,
        uint sellQuantity,
        uint buyQuantity,
        uint atTimestamp
    );
}
