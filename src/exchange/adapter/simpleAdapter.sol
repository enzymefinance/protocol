pragma solidity ^0.4.11;

import '../ExchangeInterface.sol';
import '../../dependencies/ERC20.sol';
import '../thirdparty/SimpleMarket.sol';


/// @title SimpleAdapter Contract
/// @author Melonport AG <team@melonport.com>
/// @notice An adapter between the Melon protocol and DappHubs SimpleMarket
/// @notice The concept of this can be extended to for any fully decentralised exchanges such as OasisDex, Kyber, Bancor
/// @notice Can be implemented as a library
library simpleAdapter {

    // EVENTS

    event OrderUpdated(uint id);

    // CONSTANT METHODS

    function getLastOrderId(address onExchange)
        constant
        returns (uint)
    {
        return SimpleMarket(onExchange).last_offer_id();
    }
    function isActive(address onExchange, uint id)
        constant
        returns (bool)
    {
        return SimpleMarket(onExchange).isActive(id);
    }
    function getOwner(address onExchange, uint id)
        constant
        returns (address)
    {
        return SimpleMarket(onExchange).getOwner(id);
    }
    function getOrder(address onExchange, uint id)
        constant
        returns (address, address, uint, uint)
    {
        var (
            sellQuantity,
            sellAsset,
            buyQuantity,
            buyAsset
        ) = SimpleMarket(onExchange).getOffer(id);
        return (
            address(sellAsset),
            address(buyAsset),
            sellQuantity,
            buyQuantity
        );
    }

    // NON-CONSTANT METHODS

    /// @dev Only use this in context of a delegatecall, as spending of sellAsset need to be approved first
    function makeOrder(
        address onExchange,
        address sellAsset,
        address buyAsset,
        uint sellQuantity,
        uint buyQuantity
    )
        returns (uint id)
    {
        id = SimpleMarket(onExchange).offer(
            sellQuantity,
            ERC20(sellAsset),
            buyQuantity,
            ERC20(buyAsset)
        );
        OrderUpdated(id);
    }

    /// @dev Only use this in context of a delegatecall, as spending of sellAsset need to be approved first
    function takeOrder(
        address onExchange,
        uint id,
        uint quantity
    )
        returns (bool success)
    {
        success = SimpleMarket(onExchange).buy(id, quantity);
        OrderUpdated(id);
    }

    /// @dev Only use this in context of a delegatecall, as spending of sellAsset need to be approved first
    function cancelOrder(
        address onExchange,
        uint id
    )
        returns (bool success)
    {
        success = SimpleMarket(onExchange).cancel(id);
        OrderUpdated(id);
    }
}
