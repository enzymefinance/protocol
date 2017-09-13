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

    /// Pre: To Exchange needs to be approved to spend Tokens on the Managers behalf
    /// Post: Approved to spend ofToken on Exchange
    function approveSpending(address ofToken, uint amount)
        internal
    {
        assert(ERC20(ofToken).approve(address(EXCHANGE), amount)); // TODO change to actual exchange
        /*SpendingApproved(ofToken, address(module.exchange), amount);*/
    }

    // CONSTANT METHODS

    function getLastOrderId() constant returns (uint) {
        EXCHANGE.last_offer_id();
    }
    function isActive(uint id) constant returns (bool) {}
    function getOwner(uint id) constant returns (address) {}
    function getOrder(uint id) constant returns (address, address, uint, uint) {}

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
        /*claim(sellQuantity)*/
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
