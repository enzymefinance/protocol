pragma solidity ^0.4.15;

import './RiskMgmtInterface.sol';

/// @title RiskMgmt Contract
/// @author Melonport AG <team@melonport.com>
contract RiskMgmt is RiskMgmtInterface {

    // NON-CONSTANT METHODS

    function isMakePermitted(
        uint orderPrice,
        uint orderQuantity,
        uint referencePrice
    )
        returns (bool)
    {
        return true; // For testing purposes
    }

    function isTakePermitted(
        uint orderPrice,
        uint orderQuantity,
        uint referencePrice
    )
        returns (bool)
    {
        return true; // For testing purposes
    }
}
