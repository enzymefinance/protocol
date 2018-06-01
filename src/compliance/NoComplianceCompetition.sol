pragma solidity ^0.4.19;

import "./NoCompliance.sol";

/// @title Compliance Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Anyone is allowed to invest / redeem
contract NoComplianceCompetition is NoCompliance {

    // PUBLIC VIEW METHODS

    /// @notice Always returns true
    /// @param x Address
    /// @return True
    function isCompetitionAllowed(
        address x
    )
        view
        returns (bool)
    {
        return true;
    }

}
