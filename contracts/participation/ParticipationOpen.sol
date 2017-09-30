pragma solidity ^0.4.11;

import './ParticipationInterface.sol';
import '../dependencies/DBC.sol';
import '../dependencies/Owned.sol';

/// @title Participation Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple and static Participation Module.
contract ParticipationOpen is ParticipationInterface, DBC, Owned {

    // CONSTANT METHODS

    /// @notice Required for Melon protocol interaction.
    /// @param ofParticipant Address requesting to invest in a Melon fund
    /// @param giveQuantity Quantity of Melon token times 10 ** 18 offered to receive shareQuantity
    /// @param shareQuantity Quantity of shares times 10 ** 18 requested to be received
    /// @return Whether identity is eligible to invest in a Melon fund.
    function isSubscriptionPermitted(
        address ofParticipant,
        uint256 giveQuantity,
        uint256 shareQuantity
    )
        returns (bool isEligible)
    {
        isEligible = true;
    }

    /// @notice Required for Melon protocol interaction.
    /// @param ofParticipant Address requesting to redeem from a Melon fund
    /// @param shareQuantity Quantity of shares times 10 ** 18 offered to redeem
    /// @param receiveQuantity Quantity of Melon token times 10 ** 18 requested to receive for shareQuantity
    /// @return Whether identity is eligible to redeem from a Melon fund.
    function isRedemptionPermitted(
        address ofParticipant,
        uint256 shareQuantity,
        uint256 receiveQuantity
    )
        returns (bool isEligible)
    {
        isEligible = true;
    }
}
