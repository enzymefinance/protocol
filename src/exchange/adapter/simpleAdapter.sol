pragma solidity ^0.4.19;

import "../../assets/Asset.sol";
import "../thirdparty/SimpleMarket.sol";


/// @title SimpleAdapter Contract
/// @author Melonport AG <team@melonport.com>
/// @notice An adapter between the Melon protocol and DappHubs SimpleMarket
/// @notice The concept of this can be extended to for any fully decentralised exchanges such as OasisDex, Kyber, Bancor
/// @notice Can be implemented as a library
library simpleAdapter {

    // EVENTS

    event OrderUpdated(uint id);

    // METHODS
    // PUBLIC METHODS

    /// @notice Makes an order on the given exchange
    /// @dev Only use this in context of a delegatecall, as spending of sellAsset need to be approved first
    /// @param onExchange Address of the exchange
    /// @param sellAsset Asset (as registered in Asset registrar) to be sold
    /// @param buyAsset Asset (as registered in Asset registrar) to be bought
    /// @param sellQuantity Quantity of sellAsset to be sold
    /// @param buyQuantity Quantity of buyAsset to be bought
    /// @return Order id
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
            Asset(sellAsset),
            buyQuantity,
            Asset(buyAsset)
        );
        OrderUpdated(id);
    }

    /// @notice Takes an order on the given exchange
    /// @dev For this subset of adapter no immediate settlement can be expected
    /// @param onExchange Address of the exchange
    /// @param id Order id
    /// @param quantity Quantity of order to be executed (For partial taking)
    /// @return Whether the takeOrder is successfully executed
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

    /// @notice Cancels an order on the given exchange
    /// @dev Only use this in context of a delegatecall, as spending of sellAsset need to be approved first
    /// @param onExchange Address of the exchange
    /// @param id Order id
    /// @return Whether the order is successfully cancelled
    function cancelOrder(
        address onExchange,
        uint id
    )
        returns (bool success)
    {
        success = SimpleMarket(onExchange).cancel(id);
        OrderUpdated(id);
    }

    // PUBLIC VIEW METHODS

    function getLastOrderId(address onExchange)
        view
        returns (uint)
    {
        return SimpleMarket(onExchange).last_offer_id();
    }

    function isActive(address onExchange, uint id)
        view
        returns (bool)
    {
        return SimpleMarket(onExchange).isActive(id);
    }

    function getOwner(address onExchange, uint id)
        view
        returns (address)
    {
        return SimpleMarket(onExchange).getOwner(id);
    }

    function getOrder(address onExchange, uint id)
        view
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

    function getTimestamp(address onExchange, uint id)
        view
        returns (uint)
    {
        var (, , , , , , timestamp) = SimpleMarket(onExchange).offers(id);
        return timestamp;
    }
}
