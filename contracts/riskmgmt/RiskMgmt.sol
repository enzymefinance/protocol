pragma solidity ^0.4.11;

import './RiskMgmtInterface.sol';

/// @title RiskMgmt Contract
/// @author Melonport AG <team@melonport.com>
contract RiskMgmt is RiskMgmtInterface {

    // NON-CONSTANT METHODS

    function isExchangeMakePermitted(
        uint orderPrice,
        uint orderQuantity,
        uint referencePrice
    )
        returns (bool)
    {
        return true; // For testing purposes
    }

    function isExchangeTakePermitted(
        uint orderPrice,
        uint orderQuantity,
        uint referencePrice
    )
        returns (bool)
    {
        return true; // For testing purposes
    }
}
