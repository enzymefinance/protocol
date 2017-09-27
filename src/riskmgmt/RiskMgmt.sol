pragma solidity ^0.4.11;

import './RiskMgmtInterface.sol';

/// @title RiskMgmt Contract
/// @author Melonport AG <team@melonport.com>
contract RiskMgmt is RiskMgmtInterface {

    // NON-CONSTANT METHODS

    function isMakePermitted(
        uint orderPrice,
        uint referencePrice,
        uint orderQuantity
    )
        returns (bool)
    {
        return true; // For testing purposes
    }

    function isTakePermitted(
        uint orderPrice,
        uint referencePrice,
        uint orderQuantity
    )
        returns (bool)
    {
        return true; // For testing purposes
    }
}
