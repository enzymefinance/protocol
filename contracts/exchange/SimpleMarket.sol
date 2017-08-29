pragma solidity ^0.4.8;
// TODO actually used compiler version: pragma solidity ^0.4.13;

import '../dependencies/ERC20.sol';

contract EventfulMarket {
    event ItemUpdate(uint id);
    event Trade(uint sell_how_much, address indexed sell_which_token,
                 uint buy_how_much, address indexed buy_which_token);

    event LogMake(
        bytes32  indexed  id,
        bytes32  indexed  pair,
        address  indexed  maker,
        ERC20             haveToken,
        ERC20             wantToken,
        uint128           haveAmount,
        uint128           wantAmount,
        uint64            timestamp
    );

    event LogBump(
        bytes32  indexed  id,
        bytes32  indexed  pair,
        address  indexed  maker,
        ERC20             haveToken,
        ERC20             wantToken,
        uint128           haveAmount,
        uint128           wantAmount,
        uint64            timestamp
    );

    event LogTake(
        bytes32           id,
        bytes32  indexed  pair,
        address  indexed  maker,
        ERC20             haveToken,
        ERC20             wantToken,
        address  indexed  taker,
        uint128           takeAmount,
        uint128           giveAmount,
        uint64            timestamp
    );

    event LogKill(
        bytes32  indexed  id,
        bytes32  indexed  pair,
        address  indexed  maker,
        ERC20             haveToken,
        ERC20             wantToken,
        uint128           haveAmount,
        uint128           wantAmount,
        uint64            timestamp
    );
}

contract SimpleMarket is EventfulMarket {
    bool locked;

    modifier synchronized {
        assert(!locked);
        locked = true;
        _;
        locked = false;
    }

    function assert(bool x) internal {
        if (!x) revert();
    }

    struct OfferInfo {
        uint     sell_how_much;
        ERC20    sell_which_token;
        uint     buy_how_much;
        ERC20    buy_which_token;
        address  owner;
        bool     active;
        uint64   timestamp;
    }

    mapping (uint => OfferInfo) public offers;

    uint public nextOfferId;

    modifier can_offer {
        _;
    }
    modifier can_buy(uint id) {
        assert(isActive(id));
        _;
    }
    modifier can_cancel(uint id) {
        assert(isActive(id));
        assert(getOwner(id) == msg.sender);
        _;
    }
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
    function getLastOfferId() constant returns (uint) {
        require(nextOfferId > 0);
        return nextOfferId - 1;
    }

    // non underflowing subtraction
    function safeSub(uint a, uint b) internal returns (uint) {
        assert(b <= a);
        return a - b;
    }
    // non overflowing multiplication
    function safeMul(uint a, uint b) internal returns (uint c) {
        c = a * b;
        assert(a == 0 || c / a == b);
    }

    function trade(address seller, uint sell_how_much, ERC20 sell_which_token,
                    address buyer,  uint buy_how_much,  ERC20 buy_which_token)
        internal
    {
        assert(buy_which_token.transferFrom(buyer, seller, buy_how_much));
        assert(sell_which_token.transfer(buyer, sell_how_much));
        Trade(sell_how_much, sell_which_token, buy_how_much, buy_which_token);
    }

    // ---- Public entrypoints ---- //

    function make(
        ERC20    haveToken,
        ERC20    wantToken,
        uint128  haveAmount,
        uint128  wantAmount
    ) returns (bytes32 id) {
        return bytes32(offer(haveAmount, haveToken, wantAmount, wantToken));
    }

    function take(uint id, uint128 maxTakeAmount) {
        assert(buy(uint256(id), maxTakeAmount));
    }

    function kill(bytes32 id) {
        assert(cancel(uint256(id)));
    }

    // Make a new offer. Takes funds from the caller into market escrow.
    function offer(uint sell_how_much, ERC20 sell_which_token,
                uint buy_how_much, ERC20 buy_which_token)
        can_offer
        synchronized
        returns (uint id)
    {
        assert(uint128(sell_how_much) == sell_how_much);
        assert(uint128(buy_how_much) == buy_how_much);
        assert(sell_how_much > 0);
        assert(sell_which_token != ERC20(0x0));
        assert(buy_how_much > 0);
        assert(buy_which_token != ERC20(0x0));
        assert(sell_which_token != buy_which_token);

        OfferInfo memory info;
        info.sell_how_much = sell_how_much;
        info.sell_which_token = sell_which_token;
        info.buy_how_much = buy_how_much;
        info.buy_which_token = buy_which_token;
        info.owner = msg.sender;
        info.active = true;
        info.timestamp = uint64(now);
        offers[nextOfferId] = info;
        nextOfferId++;

        var seller_paid = sell_which_token.transferFrom(msg.sender, this, sell_how_much);
        assert(seller_paid);

        ItemUpdate(id);
        LogMake(
            bytes32(id),
            sha3(sell_which_token, buy_which_token),
            msg.sender,
            sell_which_token,
            buy_which_token,
            uint128(sell_how_much),
            uint128(buy_how_much),
            uint64(now)
        );
    }

    function bump(bytes32 id_)
        can_buy(uint256(id_))
    {
        var id = uint256(id_);
        LogBump(
            id_,
            sha3(offers[id].sell_which_token, offers[id].buy_which_token),
            offers[id].owner,
            offers[id].sell_which_token,
            offers[id].buy_which_token,
            uint128(offers[id].sell_how_much),
            uint128(offers[id].buy_how_much),
            offers[id].timestamp
        );
    }

    // Accept given `quantity` of an offer. Transfers funds from caller to
    // offer maker, and from market to caller.
    function buy(uint id, uint quantity)
        can_buy(id)
        synchronized
        returns (bool success)
    {
        assert(uint128(quantity) == quantity);

        // read-only offer. Modify an offer by directly accessing offers[id]
        OfferInfo memory offer = offers[id];
        // inferred quantity that the buyer wishes to spend
        uint spend = safeMul(quantity, offer.buy_how_much) / offer.sell_how_much;
        assert(uint128(spend) == spend);

        if (spend > offer.buy_how_much || quantity > offer.sell_how_much) {
            // buyer wants more than is available
            success = false;
        } else if (spend == offer.buy_how_much && quantity == offer.sell_how_much) {
            // buyer wants exactly what is available
            delete offers[id];

            trade(offer.owner, quantity, offer.sell_which_token,
                   msg.sender, spend, offer.buy_which_token);

            ItemUpdate(id);
            LogTake(
                bytes32(id),
                sha3(offer.sell_which_token, offer.buy_which_token),
                offer.owner,
                offer.sell_which_token,
                offer.buy_which_token,
                msg.sender,
                uint128(offer.sell_how_much),
                uint128(offer.buy_how_much),
                uint64(now)
            );

            success = true;
        } else if (spend > 0 && quantity > 0) {
            // buyer wants a fraction of what is available
            offers[id].sell_how_much = safeSub(offer.sell_how_much, quantity);
            offers[id].buy_how_much = safeSub(offer.buy_how_much, spend);

            trade(offer.owner, quantity, offer.sell_which_token,
                    msg.sender, spend, offer.buy_which_token);

            ItemUpdate(id);
            LogTake(
                bytes32(id),
                sha3(offer.sell_which_token, offer.buy_which_token),
                offer.owner,
                offer.sell_which_token,
                offer.buy_which_token,
                msg.sender,
                uint128(quantity),
                uint128(spend),
                uint64(now)
            );

            success = true;
        } else {
            // buyer wants an unsatisfiable amount (less than 1 integer)
            success = false;
        }
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

        var seller_refunded = offer.sell_which_token.transfer(offer.owner , offer.sell_how_much);
        assert(seller_refunded);

        ItemUpdate(id);
        LogKill(
            bytes32(id),
            sha3(offer.sell_which_token, offer.buy_which_token),
            offer.owner,
            offer.sell_which_token,
            offer.buy_which_token,
            uint128(offer.sell_how_much),
            uint128(offer.buy_how_much),
            uint64(now)
        );

        success = true;
    }

    // returns sparse arrays
    function getOpenOffers(uint start)
        constant
        returns (uint[1024] sellAmts, address[1024] sellTokens,
                uint[1024] buyAmts, address[1024] buyTokens,
                address[1024] owners, uint[1024] timestamps)
    {
        for(uint ii = 0; ii < 1024; ii++){
            if(start + ii >= nextOfferId) break;
            if(!offers[ii].active) continue;
            sellAmts[ii] = offers[ii].sell_how_much;
            sellTokens[ii] = offers[ii].sell_which_token;
            buyAmts[ii] = offers[ii].buy_how_much;
            buyTokens[ii] = offers[ii].buy_which_token;
            owners[ii] = offers[ii].owner;
            timestamps[ii] = offers[ii].timestamp;
        }
    }
}
