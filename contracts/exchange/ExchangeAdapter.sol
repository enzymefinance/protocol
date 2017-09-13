pragma solidity ^0.4.11;

import './ExchangeInterface.sol';
import '../dependencies/DBC.sol';
import '../dependencies/Owned.sol';
import '../dependencies/ERC20.sol';
import './thirdparty/SimpleMarket.sol';


/// @title ExchangeAdapter Contract
/// @author Melonport AG <team@melonport.com>
/// @notice An adapter between the Melon protocol and DappHubs SimpleMarket
contract ExchangeAdapter is DBC, Owned, ExchangeInterface {

    // FIELDS

    SimpleMarket public EXCHANGE;

    // INTERNAL METHODS

    /// Pre: To Exchange needs to be approved to spend Tokens on the Managers behalf
    /// Post: Approved to spend ofAsset on Exchange
    function claimAsset(address ofAsset, uint quantity)
        internal
    {
        assert(ERC20(ofAsset).transferFrom(msg.sender, this, quantity));
    }

    /// Pre: Exchange needs to be approved to spend Tokens on the adapters behalf
    /// Post: Approved to spend ofAsset on Exchange
    function approveSpending(address ofAsset, uint quantity)
        internal
    {
        assert(ERC20(ofAsset).approve(address(EXCHANGE), quantity));
    }

    // CONSTANT METHODS

    function getLastOrderId() constant returns (uint) {
        return EXCHANGE.last_offer_id();
    }
    function isActive(uint id) constant returns (bool) {
        return EXCHANGE.isActive(id);
    }
    function getOwner(uint id) constant returns (address) {
        return EXCHANGE.getOwner(id);
    }
    function getOrder(uint id) constant returns (address, address, uint, uint) {
        var (
            sellQuantity,
            sellAsset,
            buyQuantity,
            buyAsset
        ) = EXCHANGE.getOffer(id);
        return (
            address(sellAsset),
            address(buyAsset),
            sellQuantity,
            buyQuantity
        );
    }

    // NON-CONSTANT METHODS

    function ExchangeAdapter(
        address ofSimpleMarket
    ) {
        EXCHANGE = SimpleMarket(ofSimpleMarket);
    }

    function makeOrder(
        address sellAsset,
        address buyAsset,
        uint sellQuantity,
        uint buyQuantity
    ) external returns (uint id) {
        claimAsset(sellAsset, sellQuantity);
        approveSpending(sellAsset, sellQuantity);
        return EXCHANGE.offer(
            sellQuantity,
            ERC20(sellAsset),
            buyQuantity,
            ERC20(buyAsset)
        );
    }

    function takeOrder(uint id, uint quantity) external returns (bool) {
        return EXCHANGE.buy(id, quantity);
    }

    function cancelOrder(uint id) external returns (bool) {
        return EXCHANGE.cancel(id);
    }

}
