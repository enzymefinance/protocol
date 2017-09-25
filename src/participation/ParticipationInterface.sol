pragma solidity ^0.4.11;

/// @title Participation Interface Contract
/// @author Melonport AG <team@melonport.com>
/// @notice This is to be considered as an interface on how to access the underlying Participation Contract
contract ParticipationInterface {

    // CONSTANT METHODS

    /// @notice Required for Melon protocol interaction.
    /// @param ofParticipant Address requesting to invest in a Melon fund
    /// @param numShares Quantity of shares times 10 ** 18 requested to be received
    /// @param offeredValue Quantity of Melon token times 10 ** 18 offered to receive numShares
    /// @return Whether identity is eligible to invest in a Melon fund.
    function isSubscriptionPermitted(
        address ofParticipant,
        uint256 numShares,
        uint256 offeredValue
    ) returns (bool isEligible) {}

    /// @notice Required for Melon protocol interaction.
    /// @param ofParticipant Address requesting to redeem from a Melon fund
    /// @param numShares Quantity of shares times 10 ** 18 offered to redeem
    /// @param requestedValue Quantity of Melon token times 10 ** 18 requested to receive for numShares
    /// @return Whether identity is eligible to redeem from a Melon fund.
    function isRedemptionPermitted(
        address ofParticipant,
        uint256 numShares,
        uint256 requestedValue
    ) returns (bool isEligible) {}
}
