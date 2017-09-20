pragma solidity ^0.4.11;

import './ParticipationInterface.sol';
import '../dependencies/DBC.sol';
import '../dependencies/Owned.sol';

/// @title Participation Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple and static Participation Module.
contract ParticipationOpen is ParticipationInterface, DBC, Owned {

    // CONSTANT METHODS

    /// @dev Pre: Request ID
    /// @dev Post Boolean dependent on market data and on personel data; Compliance
    function isSubscriptionPermitted(
        address owner,
        uint256 numShares,
        uint256 offeredValue
    )
        returns (bool)
    {
        return true;
    }

    /// @dev Pre: Request ID
    /// @dev Post Boolean whether permitted or not
    function isRedemptionPermitted(
        address owner,
        uint256 numShares,
        uint256 requestedValue
    )
        returns (bool)
    {
        return true;
    }
}
