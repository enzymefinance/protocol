pragma solidity ^0.4.4;

import "./TradingProtocol.sol";
import "../exchange/Exchange.sol";
import '../dependencies/ERC20.sol';
import '../dependencies/SafeMath.sol';
import "../dependencies/Owned.sol";

/// @title Trading Contract
/// @author Melonport AG <team@melonport.com>
contract Trading is TradingProtocol, SafeMath, Owned {

    // FILEDS

    Exchange exchange;

    // EVENTS

    // MODIFIERS

    modifier Exchange_initialized(Exchange x) {
        assert(x != Exchange(0x0));
        _;
    }

    // CONSTANT METHODS

    // NON-CONSTANT METHODS

    function Trading(Exchange setExchange) {
        exchange = setExchange;
    }

    function offer(
        uint sell_how_much, ERC20 sell_which_token,
        uint buy_how_much,  ERC20 buy_which_token
    )
    {
        uint id = exchange.offer(sell_how_much, sell_which_token, buy_how_much, buy_which_token);
        assert(id >= 1);
    }

    function buy(uint id, uint quantity) {
        assert(exchange.buy(id, quantity));
    }

    function cancel(uint id) {
        assert(exchange.cancel(id));
    }

}
