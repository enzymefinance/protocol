pragma solidity ^0.4.21;

import "../dependencies/DBC.sol";
import "../dependencies/Owned.sol";
import "./ComplianceInterface.sol";
import "../FundInterface.sol";

/// @title Bug Bounty Compliance Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Only allows manager to invest, and whitelisted addresses to create Funds
contract BugBountyCompliance is ComplianceInterface, DBC, Owned {

    mapping (address => bool) isWhitelisted;

    // PUBLIC VIEW METHODS

    /// @notice Checks whether investment is permitted for a participant
    /// @param ofParticipant Address requesting to invest in a Melon fund
    /// @param giveQuantity Quantity of Melon token times 10 ** 18 offered to receive shareQuantity
    /// @param shareQuantity Quantity of shares times 10 ** 18 requested to be received
    /// @return Whether identity is eligible to invest in a Melon fund.
    function isInvestmentPermitted(
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

    /// @notice Checks whether an address is whitelisted in the competition contract and competition is active
    /// @param user Address
    /// @return Whether the address is whitelisted
    function isCompetitionAllowed(address user)
        view
        returns (bool)
    {
        return isWhitelisted[user];
    }


    // PUBLIC METHODS

    function addToWhitelist(address user)
        pre_cond(isOwner())
    {
        isWhitelisted[user] = true;
    }

    function removeFromWhitelist(address user)
        pre_cond(isOwner())
    {
        isWhitelisted[user] = false;
    }
}

