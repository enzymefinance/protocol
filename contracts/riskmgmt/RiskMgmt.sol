pragma solidity ^0.4.11;

import './RiskMgmtInterface.sol';

/// @title RiskMgmt Contract
/// @author Melonport AG <team@melonport.com>
contract RiskMgmt is RiskMgmtInterface {

    // NON-CONSTANT METHODS

    function isExchangeMakePermitted(
        ERC20   haveToken,
        ERC20   wantToken,
        uint    haveAmount,
        uint    wantAmount,
        uint    referencePrice
    )
        returns (bool)
    {
        return true; // For testing purposes
    }

    function isExchangeTakePermitted(
        ERC20   haveToken,
        ERC20   wantToken,
        uint    haveAmount,
        uint    wantAmount,
        uint    referencePrice,
        address orderOwner
    )
        returns (bool)
    {
        return true; // For testing purposes
    }
}
