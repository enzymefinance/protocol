pragma solidity ^0.4.11;

import '../dependencies/ERC20.sol';

/// @title Exchange Interface Contract
/// @author Melonport AG <team@melonport.com>
/// @notice This is to be considered as an interface on how to access the underlying Exchange Contract
/// @notice This interface should work for any fully decentralised exchanges such as OasisDex, Kyber, Bancor
/// @notice Interface influenced by
///   https://github.com/makerdao/maker-otc/blob/master/src/simple_market.sol and
///   https://github.com/0xProject/contracts/blob/master/contracts/Exchange.sol
contract ExchangeInterface {

    // EVENTS

    event OrderUpdated(uint id);

    // CONSTANT METHODS

    function getLastOrderId() constant returns (uint) {}
    function isActive(uint id) constant returns (bool) {}
    function getOwner(uint id) constant returns (address) {}
    function getOrder(uint id) constant returns (address, address, uint, uint) {}

    // NON-CONSTANT METHODS

    function makeOrder(
        address sellAsset,
        address buyAsset,
        uint sellQuantity,
        uint buyQuantity
    ) external returns (uint) {}
    function takeOrder(uint id, uint quantity) external returns (bool) {}
    function cancelOrder(uint id) external returns (bool) {}
}
