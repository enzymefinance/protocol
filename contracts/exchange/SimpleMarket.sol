pragma solidity ^0.4.4;

import '../dependencies/ERC20.sol';
import '../dependencies/SafeMath.sol';
import '../dependencies/MutexUser.sol';

/// @title Ether Token Contract.
/// @author Melonport AG <team@melonport.com>
/// @notice Inspired by https://github.com/makerdao/maker-otc/blob/master/contracts/simple_market.sol
contract SimpleMarket is SafeMath, MutexUser {

    // FIELDS

    struct OfferInfo {
        uint sell_how_much;
        ERC20 sell_which_token;
        uint buy_how_much;
        ERC20 buy_which_token;
        address owner;
        bool active;
    }
    mapping( uint => OfferInfo ) public offers;

    uint public lastOfferId;

    // EVENTS

    event ItemUpdate(uint id);
    event Trade(uint sell_how_much, address indexed sell_which_token,
        uint buy_how_much, address indexed buy_which_token);

    // METHODS

    modifier is_past_zero(uint x) {
        if (x <= 0) throw;
        _;
    }

    modifier ERC20_initialized(ERC20 x) {
        if (x == ERC20(0x0)) throw;
        _;
    }

    modifier ERC20_not_equal(ERC20 x, ERC20 y) {
        if (x == y) throw;
        _;
    }

    modifier is_offer_active(uint id) {
        if (!isActive(id)) throw;
        _;
    }

    modifier only_offer_owner(uint id) {
        if (msg.sender != getOwner(id)) throw;
        _;
    }

    // CONSTANT METHODS

    function isActive(uint id) constant returns (bool active) {
        return offers[id].active;
    }

    function getOwner(uint id) constant returns (address owner) {
        return offers[id].owner;
    }

    function getOffer(uint id) constant returns (uint, ERC20, uint, ERC20) {
      var offer = offers[id];
      return (offer.sell_how_much, offer.sell_which_token,
              offer.buy_how_much, offer.buy_which_token);
    }

    // NON-CONSTANT INTERNAL METHODS

    function next_id() internal returns (uint) {
        lastOfferId++; return lastOfferId;
    }

    function trade(
        address seller, uint sell_how_much, ERC20 sell_which_token,
        address buyer,  uint buy_how_much,  ERC20 buy_which_token
    )
        internal
    {
        if (!buy_which_token.transferFrom(buyer, seller, buy_how_much)) throw;
        if (!sell_which_token.transfer(buyer, sell_how_much)) throw;
        Trade(sell_how_much, sell_which_token, buy_how_much, buy_which_token);
    }

    // NON-CONSTANT PUBLIC METHODS

    // Make a new offer. Takes funds from the caller into market escrow.
    function offer(
        uint sell_how_much, ERC20 sell_which_token,
        uint buy_how_much,  ERC20 buy_which_token
    )
        exclusive
        is_past_zero(sell_how_much)
        is_past_zero(buy_how_much)
        ERC20_initialized(sell_which_token)
        ERC20_initialized(buy_which_token)
        ERC20_not_equal(sell_which_token, buy_which_token)
        returns (uint id)
    {
        OfferInfo memory info;
        info.sell_how_much = sell_how_much;
        info.sell_which_token = sell_which_token;
        info.buy_how_much = buy_how_much;
        info.buy_which_token = buy_which_token;
        info.owner = msg.sender;
        info.active = true;
        id = next_id();
        offers[id] = info;
        if (!sell_which_token.transferFrom(msg.sender, this, sell_how_much)) throw;
        ItemUpdate(id);
    }
    // Accept given `quantity` of an offer. Transfers funds from caller to
    // offer maker, and from market to caller.
    function buy(uint id, uint quantity)
        exclusive
        is_offer_active(id)
        returns (bool)
    {
        // read-only offer. Modify an offer by directly accessing offers[id]
        OfferInfo memory offer = offers[id];

        // inferred quantity that the buyer wishes to spend
        uint spend = safeMul(quantity, offer.buy_how_much) / offer.sell_how_much;
        if (spend > offer.buy_how_much || quantity > offer.sell_how_much) {
            // buyer wants more than is available
            return false;
        }
        if (spend == offer.buy_how_much && quantity == offer.sell_how_much) {
            // buyer wants exactly what is available
            delete offers[id];
            trade(offer.owner, quantity, offer.sell_which_token,
                msg.sender, spend, offer.buy_which_token);
            ItemUpdate(id);
            return true;
        }
        if (spend > 0 && quantity > 0) {
            // buyer wants a fraction of what is available
            offers[id].sell_how_much = safeSub(offer.sell_how_much, quantity);
            offers[id].buy_how_much = safeSub(offer.buy_how_much, spend);
            trade(offer.owner, quantity, offer.sell_which_token,
                msg.sender, spend, offer.buy_which_token);
            ItemUpdate(id);
            return true;
        }
        // buyer wants an unsatisfiable amount (less than 1 integer)
        return false;
    }

    // Cancel an offer. Refunds offer maker.
    function cancel(uint id)
        exclusive
        is_offer_active(id)
        only_offer_owner(id)
        returns (bool)
    {
        // read-only offer. Modify an offer by directly accessing offers[id]
        OfferInfo memory offer = offers[id];
        delete offers[id];
        if (!offer.sell_which_token.transfer(offer.owner, offer.sell_how_much)) throw;
        ItemUpdate(id);
        return true;
    }
}
