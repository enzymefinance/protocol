pragma solidity ^0.4.11;

import './RiskMgmtInterface.sol';

/// @title RiskMgmt Contract
/// @author Melonport AG <team@melonport.com>
contract RiskMgmt is RiskMgmtInterface {

    // FIELDS

    // EVENTS

    // MODIFIERS

    // CONSTANT METHODS

    // NON-CONSTANT METHODS

    function isExchangeMakePermitted(
        uint actualPrice,
        uint referencePrice,
        uint quantity
    )
        returns (bool)
    {
        return true; // For testing purposes
    }

    function isExchangeTakePermitted(
        uint actualPrice,
        uint referencePrice,
        uint quantity,
        address orderOwner
    )
        returns (bool)
    {
        return true; // For testing purposes
    }
}
