pragma solidity ^0.4.21;

import "../dependencies/DBC.sol";
import "../dependencies/Owned.sol";
import "../competitions/CompetitionInterface.sol";
import "./ComplianceInterface.sol";

/// @title Competition Compliance Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Only allows competition contract address to invest, redeem.
contract CompetitionCompliance is ComplianceInterface, DBC, Owned {

    address public competitionAddress;

    // CONSTRUCTOR

    /// @dev Constructor
    /// @param ofCompetition Address of the competition contract
    function CompetitionCompliance(address ofCompetition) public {
        competitionAddress = ofCompetition;
    }

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
        return competitionAddress == ofParticipant;
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
        return competitionAddress == ofParticipant;
    }

    /// @notice Checks whether an address is whitelisted in the competition contract and competition is active
    /// @param x Address
    /// @return Whether the address is whitelisted
    function isCompetitionAllowed(
        address x
    )
        view
        returns (bool)
    {
        return CompetitionInterface(competitionAddress).isWhitelisted(x) && CompetitionInterface(competitionAddress).isCompetitionActive();
    }


    // PUBLIC METHODS

    /// @notice Changes the competition address
    /// @param ofCompetition Address of the competition contract
    function changeCompetitionAddress(
        address ofCompetition
    )
        pre_cond(isOwner())
    {
        competitionAddress = ofCompetition;
    }

}
