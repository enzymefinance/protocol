/// math.sol -- mixin for inline numerical wizardry

// Copyright (C) 2015, 2016, 2017  DappHub, LLC

// Licensed under the Apache License, Version 2.0 (the "License").
// You may not use this file except in compliance with the License.

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND (express or implied).

pragma solidity ^0.4.21;

import '../../assets/Asset.sol';
import "../../dependencies/math.sol";

contract EventfulMarket {
    event LogItemUpdate(uint id);
    event LogTrade(uint pay_amt, address indexed pay_gem,
                   uint buy_amt, address indexed buy_gem);

    event LogMake(
        bytes32  indexed  id,
        bytes32  indexed  pair,
        address  indexed  maker,
        Asset             pay_gem,
        Asset             buy_gem,
        uint128           pay_amt,
        uint128           buy_amt,
        uint64            timestamp
    );

    event LogBump(
        bytes32  indexed  id,
        bytes32  indexed  pair,
        address  indexed  maker,
        Asset             pay_gem,
        Asset             buy_gem,
        uint128           pay_amt,
        uint128           buy_amt,
        uint64            timestamp
    );

    event LogTake(
        bytes32           id,
        bytes32  indexed  pair,
        address  indexed  maker,
        Asset             pay_gem,
        Asset             buy_gem,
        address  indexed  taker,
        uint128           take_amt,
        uint128           give_amt,
        uint64            timestamp
    );

    event LogKill(
        bytes32  indexed  id,
        bytes32  indexed  pair,
        address  indexed  maker,
        Asset             pay_gem,
        Asset             buy_gem,
        uint128           pay_amt,
        uint128           buy_amt,
        uint64            timestamp
    );
}

contract SimpleMarket is EventfulMarket, DSMath {

    uint public last_offer_id;

    mapping (uint => OfferInfo) public offers;

    bool locked;

    struct OfferInfo {
        uint     pay_amt;
        Asset    pay_gem;
        uint     buy_amt;
        Asset    buy_gem;
        address  owner;
        bool     active;
        uint64   timestamp;
    }

    modifier can_buy(uint id) {
        require(isActive(id));
        _;
    }

    modifier can_cancel(uint id) {
        require(isActive(id));
        require(getOwner(id) == msg.sender);
        _;
    }

    modifier can_offer {
        _;
    }

    modifier synchronized {
        assert(!locked);
        locked = true;
        _;
        locked = false;
    }

    function isActive(uint id) constant returns (bool active) {
        return offers[id].active;
    }

    function getOwner(uint id) constant returns (address owner) {
        return offers[id].owner;
    }

    function getOffer(uint id) constant returns (uint, Asset, uint, Asset) {
      var offer = offers[id];
      return (offer.pay_amt, offer.pay_gem,
              offer.buy_amt, offer.buy_gem);
    }

    // ---- Public entrypoints ---- //

    function bump(bytes32 id_)
        can_buy(uint256(id_))
    {
        var id = uint256(id_);
        LogBump(
            id_,
            keccak256(offers[id].pay_gem, offers[id].buy_gem),
            offers[id].owner,
            offers[id].pay_gem,
            offers[id].buy_gem,
            uint128(offers[id].pay_amt),
            uint128(offers[id].buy_amt),
            offers[id].timestamp
        );
    }

    // Accept given `quantity` of an offer. Transfers funds from caller to
    // offer maker, and from market to caller.
    function buy(uint id, uint quantity)
        can_buy(id)
        synchronized
        returns (bool)
    {
        OfferInfo memory offer = offers[id];
        uint spend = mul(quantity, offer.buy_amt) / offer.pay_amt;

        require(uint128(spend) == spend);
        require(uint128(quantity) == quantity);

        // For backwards semantic compatibility.
        if (quantity == 0 || spend == 0 ||
            quantity > offer.pay_amt || spend > offer.buy_amt)
        {
            return false;
        }

        offers[id].pay_amt = sub(offer.pay_amt, quantity);
        offers[id].buy_amt = sub(offer.buy_amt, spend);
        assert( offer.buy_gem.transferFrom(msg.sender, this, spend) );
        assert( offer.buy_gem.transfer(offer.owner, spend) );
        assert( offer.pay_gem.transfer(msg.sender, quantity) );

        LogItemUpdate(id);
        LogTake(
            bytes32(id),
            keccak256(offer.pay_gem, offer.buy_gem),
            offer.owner,
            offer.pay_gem,
            offer.buy_gem,
            msg.sender,
            uint128(quantity),
            uint128(spend),
            uint64(now)
        );
        LogTrade(quantity, offer.pay_gem, spend, offer.buy_gem);

        if (offers[id].pay_amt == 0) {
            delete offers[id];
        }

        return true;
    }

    // Cancel an offer. Refunds offer maker.
    function cancel(uint id)
        can_cancel(id)
        synchronized
        returns (bool success)
    {
        // read-only offer. Modify an offer by directly accessing offers[id]
        OfferInfo memory offer = offers[id];
        delete offers[id];

        assert( offer.pay_gem.transfer(offer.owner, offer.pay_amt) );

        LogItemUpdate(id);
        LogKill(
            bytes32(id),
            keccak256(offer.pay_gem, offer.buy_gem),
            offer.owner,
            offer.pay_gem,
            offer.buy_gem,
            uint128(offer.pay_amt),
            uint128(offer.buy_amt),
            uint64(now)
        );

        success = true;
    }

    function kill(bytes32 id) {
        assert(cancel(uint256(id)));
    }

    function make(
        Asset    pay_gem,
        Asset    buy_gem,
        uint128  pay_amt,
        uint128  buy_amt
    ) returns (bytes32 id) {
        return bytes32(offer(pay_amt, pay_gem, buy_amt, buy_gem));
    }

    // Make a new offer. Takes funds from the caller into market escrow.
    function offer(uint pay_amt, Asset pay_gem, uint buy_amt, Asset buy_gem)
        can_offer
        synchronized
        returns (uint id)
    {
        require(uint128(pay_amt) == pay_amt);
        require(uint128(buy_amt) == buy_amt);
        require(pay_amt > 0);
        require(pay_gem != Asset(0x0));
        require(buy_amt > 0);
        require(buy_gem != Asset(0x0));
        require(pay_gem != buy_gem);

        OfferInfo memory info;
        info.pay_amt = pay_amt;
        info.pay_gem = pay_gem;
        info.buy_amt = buy_amt;
        info.buy_gem = buy_gem;
        info.owner = msg.sender;
        info.active = true;
        info.timestamp = uint64(now);
        id = _next_id();
        offers[id] = info;

        assert( pay_gem.transferFrom(msg.sender, this, pay_amt) );

        LogItemUpdate(id);
        LogMake(
            bytes32(id),
            keccak256(pay_gem, buy_gem),
            msg.sender,
            pay_gem,
            buy_gem,
            uint128(pay_amt),
            uint128(buy_amt),
            uint64(now)
        );
    }

    function take(bytes32 id, uint128 maxTakeAmount) {
        assert(buy(uint256(id), maxTakeAmount));
    }

    function _next_id() internal returns (uint) {
        last_offer_id++; return last_offer_id;
    }

    function tokenFallback(address ofSender, uint tokenAmount, bytes metadata) {
        return;
    }
}
