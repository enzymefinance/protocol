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

    function getLastOrderId(address onConsigned)
        constant
        returns (uint)
    {
        return SimpleMarket(onConsigned).last_offer_id();
    }
    function isActive(address onConsigned, uint id)
        constant
        returns (bool)
    {
        return SimpleMarket(onConsigned).isActive(id);
    }
    function getOwner(address onConsigned, uint id)
        constant
        returns (address)
    {
        return SimpleMarket(onConsigned).getOwner(id);
    }
    function getOrder(address onConsigned, uint id)
        constant
        returns (address, address, uint, uint)
    {
        var (
            sellQuantity,
            sellAsset,
            buyQuantity,
            buyAsset
        ) = SimpleMarket(onConsigned).getOffer(id);
        return (
            address(sellAsset),
            address(buyAsset),
            sellQuantity,
            buyQuantity
        );
    }

    // NON-CONSTANT METHODS

    function makeOrder(
        address onConsigned,
        address sellAsset,
        address buyAsset,
        uint sellQuantity,
        uint buyQuantity
    )
        /*external*/
        returns (uint id)
    {
        id = SimpleMarket(onConsigned).offer(
            sellQuantity,
            ERC20(sellAsset),
            buyQuantity,
            ERC20(buyAsset)
        );
        OrderUpdated(id);
    }

    function takeOrder(
        address onConsigned,
        uint id,
        uint quantity
    )
        /*external*/
        returns (bool success)
    {
        success = SimpleMarket(onConsigned).buy(id, quantity);
        OrderUpdated(id);
    }

    function cancelOrder(
        address onConsigned,
        uint id
    )
        /*external*/
        returns (bool success)
    {
        success = SimpleMarket(onConsigned).cancel(id);
        OrderUpdated(id);
    }
}
