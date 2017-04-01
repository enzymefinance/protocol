pragma solidity ^0.4.8;

import '../dependencies/ERC20.sol';

/// @title RiskMgmtProtocol Contract
/// @author Melonport AG <team@melonport.com>
/// @notice This is to be considered as a protocol on how to access the underlying RiskMgmt Contract
contract RiskMgmtProtocol {

    function isExchangeMakePermitted(
        address onExchange,
        uint sell_how_much, ERC20 sell_which_token,
        uint buy_how_much,  ERC20 buy_which_token
    )
        returns (bool)
    {}

    function isExchangeTakePermitted(
        address onExchange,
        uint sell_how_much, ERC20 sell_which_token,
        uint buy_how_much,  ERC20 buy_which_token
    )
        returns (bool)
    {}

}
