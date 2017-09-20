pragma solidity ^0.4.11;

import './ParticipationInterface.sol';
import '../dependencies/DBC.sol';
import '../dependencies/Owned.sol';

/// @title Participation Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple and static Participation Module.
contract ParticipationOpen is ParticipationInterface, DBC, Owned {

    // CONSTANT METHODS

    function isSubscriptionPermitted(
        address ofParticipant,
        uint256 numShares,
        uint256 offeredValue
    )
        returns (bool isEligible)
    {
        isEligible = true;
    }

    function isRedemptionPermitted(
        address ofParticipant,
        uint256 numShares,
        uint256 requestedValue
    )
        returns (bool isEligible)
    {
        isEligible = true;
    }
}
