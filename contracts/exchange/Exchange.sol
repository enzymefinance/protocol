pragma solidity ^0.4.11;

import '../dependencies/ERC20.sol';
import "../dependencies/DBC.sol";
import '../dependencies/SafeMath.sol';
import '../dependencies/MutexUser.sol';
import "./ExchangeProtocol.sol";

/// @title Ether Token Contract.
/// @author Melonport AG <team@melonport.com>
/// @notice Inspired by https://github.com/makerdao/maker-otc/blob/master/contracts/simple_market.sol
contract Exchange is ExchangeProtocol, DBC, SafeMath, MutexUser {

    // TYPES

    struct OrderInfo {
        uint sell_how_much;
        ERC20 sell_which_token;
        uint buy_how_much;
        ERC20 buy_which_token;
        address owner;
        bool active;
    }

    // FIELDS

    mapping( uint => OrderInfo ) public orders;
    uint public lastOrderId;

    // PRE, POST, INVARIANT CONDITIONS

    function isPastZero(uint x) internal returns (bool) { return 0 < x; }
    function isSet(address x) internal returns (bool) { return x != 0; }
    function notEqual(address x, address y) internal returns (bool) { return x != y; }
    function isOfferActive(uint id) internal returns (bool) { return isActive(id); }
    function onlyOfferOwner(uint id) internal returns (bool) { return msg.sender == getOwner(id); }

    // CONSTANT METHODS

    function getLastOrderId() constant returns (uint) { return lastOrderId; }
    function isActive(uint id) constant returns (bool) { return orders[id].active; }
    function getOwner(uint id) constant returns (address) { return orders[id].owner; }
    function getOrder(uint id) constant returns (uint, ERC20, uint, ERC20) {
      var offer = orders[id];
      return (offer.sell_how_much, offer.sell_which_token,
              offer.buy_how_much, offer.buy_which_token);
    }

    // NON-CONSTANT INTERNAL METHODS

    function next_id() internal returns (uint) {
        lastOrderId++; return lastOrderId;
    }

    function trade(
        address seller, uint sell_how_much, ERC20 sell_which_token,
        address buyer,  uint buy_how_much,  ERC20 buy_which_token
    )
        internal
    {
        assert(buy_which_token.transferFrom(buyer, seller, buy_how_much));
        assert(sell_which_token.transfer(buyer, sell_how_much));
        Trade(sell_how_much, sell_which_token, buy_how_much, buy_which_token);
    }

    // NON-CONSTANT PUBLIC METHODS

    // Make a new offer. Takes funds from the caller into exchnage escrow.
    function make(
        uint sell_how_much, ERC20 sell_which_token,
        uint buy_how_much,  ERC20 buy_which_token
    )
        exclusive
        pre_cond(isPastZero(sell_how_much))
        pre_cond(isPastZero(buy_how_much))
        pre_cond(isSet(sell_which_token))
        pre_cond(isSet(buy_which_token))
        pre_cond(notEqual(sell_which_token, buy_which_token))
        returns (uint id)
    {
        OrderInfo memory info;
        info.sell_how_much = sell_how_much;
        info.sell_which_token = sell_which_token;
        info.buy_how_much = buy_how_much;
        info.buy_which_token = buy_which_token;
        info.owner = msg.sender;
        info.active = true;
        id = next_id();
        orders[id] = info;
        assert(sell_which_token.transferFrom( msg.sender, this, info.sell_how_much));
        OrderUpdate(id);
    }

    // Accept given `quantity` of an offer. Transfers funds from caller to
    // offer maker, and from market to caller.
    function take(uint id, uint quantity)
        exclusive
        pre_cond(isOfferActive(id))
        returns (bool)
    {
        // read-only offer. Modify an offer by directly accessing orders[id]
        OrderInfo memory offer = orders[id];

        // inferred quantity that the buyer wishes to spend
        uint spend = safeMul(quantity, offer.buy_how_much) / offer.sell_how_much;
        if (spend > offer.buy_how_much || quantity > offer.sell_how_much) {
            // buyer wants more than is available
            return false;
        }
        if (spend == offer.buy_how_much && quantity == offer.sell_how_much) {
            // buyer wants exactly what is available
            delete orders[id];
            trade(offer.owner, quantity, offer.sell_which_token,
                msg.sender, spend, offer.buy_which_token);
            OrderUpdate(id);
            return true;
        }
        if (spend > 0 && quantity > 0) {
            // buyer wants a fraction of what is available
            orders[id].sell_how_much = safeSub(offer.sell_how_much, quantity);
            orders[id].buy_how_much = safeSub(offer.buy_how_much, spend);
            trade(offer.owner, quantity, offer.sell_which_token,
                msg.sender, spend, offer.buy_which_token);
            OrderUpdate(id);
            return true;
        }
        // buyer wants an unsatisfiable amount (less than 1 integer)
        return false;
    }

    // Cancel an offer. Refunds offer maker.
    function cancel(uint id)
        exclusive
        pre_cond(isOfferActive(id))
        pre_cond(onlyOfferOwner(id))
        returns (bool)
    {
        // read-only offer. Modify an offer by directly accessing orders[id]
        OrderInfo memory offer = orders[id];
        delete orders[id];
        assert(offer.sell_which_token.transfer(offer.owner, offer.sell_how_much));
        OrderUpdate(id);
        return true;
    }
}
