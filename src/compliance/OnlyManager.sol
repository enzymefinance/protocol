pragma solidity ^0.4.19;

import "./ComplianceInterface.sol";
import "../FundInterface.sol";

/// @title Compliance Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Only allow manager to invest in the Fund.
contract OnlyManager is ComplianceInterface {

    // PUBLIC VIEW METHODS

    /// @notice Checks whether subscription is permitted for a participant
    /// @param ofParticipant Address requesting to invest in a Melon fund
    /// @param giveQuantity Quantity of Melon token times 10 ** 18 offered to receive shareQuantity
    /// @param shareQuantity Quantity of shares times 10 ** 18 requested to be received
    /// @return Whether identity is eligible to invest in a Melon fund.
    function isSubscriptionPermitted(
        address ofParticipant,
        uint256 giveQuantity,
        uint256 shareQuantity
    )
        view
        returns (bool)
    {
        return FundInterface(msg.sender).getManager() == ofParticipant;
    }

    /// @notice Checks whether redemption is permitted for a participant
    /// @param ofParticipant Address requesting to redeem from a Melon fund
    /// @param shareQuantity Quantity of shares times 10 ** 18 offered to redeem
    /// @param receiveQuantity Quantity of Melon token times 10 ** 18 requested to receive for shareQuantity
    /// @return isEligible Whether identity is eligible to redeem from a Melon fund.
    function isRedemptionPermitted(
        address ofParticipant,
        uint256 shareQuantity,
        uint256 receiveQuantity
    )
        view
        returns (bool)
    {
        return true;    // No need for KYC/AML in case of redeeming shares
    }
}
