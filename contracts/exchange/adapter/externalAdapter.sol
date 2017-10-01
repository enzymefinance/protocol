pragma solidity ^0.4.11;

import '../../dependencies/ERC20.sol';


/// @title SimpleAdapter Contract
/// @author Melonport AG <team@melonport.com>
/// @notice An adapter between the Melon protocol and DappHubs SimpleMarket
/// @notice The concept of this can be extended to for any fully decentralised exchanges such as OasisDex, Kyber, Bancor
/// @notice Can be implemented as a library
library externalAdapter {

    // EVENTS

    event OrderUpdated(uint id);

    // CONSTANT METHODS

    /// @dev External, thirdparty, centralised API call needed for interface
    function getLastOrderId(address onExchange)
        constant
        returns (uint)
    {
        throw;
    }
    /// @dev External, thirdparty, centralised API call needed for interface
    function isActive(address onExchange, uint id)
        constant
        returns (bool)
    {
        throw;
    }
    /// @dev External, thirdparty, centralised API call needed for interface
    function getOwner(address onExchange, uint id)
        constant
        returns (address)
    {
        throw;
    }
    /// @dev External, thirdparty, centralised API call needed for interface
    function getOrder(address onExchange, uint id)
        constant
        returns (address, address, uint, uint)
    {
        throw;
    }
    function getTimestamp(address onExchange, uint id)
        constant
        returns (uint)
    {
        throw;
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
        id = ERC20(sellAsset).transfer(msg.sender, sellQuantity) ? 1 : 0; // Convert bool to uint
        OrderUpdated(id);
    }

    /// @dev For this subset of adapter no immediate settlement can be expected
    function takeOrder(
        address onExchange,
        uint id,
        uint quantity
    )
        returns (bool success)
    {
        throw; // Not allowed since no immediate settlement expectation
    }

    /// @dev Only use this in context of a delegatecall, as spending of sellAsset need to be approved first
    function cancelOrder(
        address onExchange,
        uint id
    )
        returns (bool success)
    {
        success = true; // Always succeeds, just needs updating of internalAccounting
        OrderUpdated(id);
    }
}
