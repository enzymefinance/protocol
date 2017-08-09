pragma solidity ^0.4.11;

import './RiskMgmtAdapter.sol';

/// @title RiskMgmt Contract
/// @author Melonport AG <team@melonport.com>
contract RiskMgmt is RiskMgmtAdapter {

    // FIELDS

    // EVENTS

    // MODIFIERS

    // CONSTANT METHODS

    // NON-CONSTANT METHODS

    function isExchangeMakePermitted(
        ERC20    haveToken,
        ERC20    wantToken,
        uint128  haveAmount,
        uint128  wantAmount
    )
        returns (bool)
    {
        return true; // For testing purposes
    }

    function isExchangeTakePermitted(
        ERC20    haveToken,
        ERC20    wantToken,
        uint128  haveAmount,
        uint128  wantAmount,
        address orderOwner
    )
        returns (bool)
    {
        return true; // For testing purposes
    }
}
