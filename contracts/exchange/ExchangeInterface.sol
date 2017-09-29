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

    function getLastOrderId(address onExchange) constant returns (uint) {}
    function isActive(address onExchange, uint id) constant returns (bool) {}
    function getOwner(address onExchange, uint id) constant returns (address) {}
    function getOrder(address onExchange, uint id) constant returns (address, address, uint, uint) {}
    function getTimestamp(address onExchange, uint id) constant returns (uint) {}

    // NON-CONSTANT METHODS

    function makeOrder(
        address onExchange,
        address sellAsset,
        address buyAsset,
        uint sellQuantity,
        uint buyQuantity
    ) external returns (uint) {}
    function takeOrder(address onExchange, uint id, uint quantity) external returns (bool) {}
    function cancelOrder(address onExchange, uint id) external returns (bool) {}
}
