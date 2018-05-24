pragma solidity ^0.4.21;

import "../dependencies/DBC.sol";
import "../dependencies/Owned.sol";
import "./ComplianceInterface.sol";

/// @title Compliance Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Compliance module to individually approve investors; This can also be done by the manager
contract Compliance is ComplianceInterface, DBC, Owned {

    // TYPES

    struct Identity {    // Information about identity
        bool isEligible; // Whether identiy is eligible to invest
        /* .. additional information
         *   for example how much identity is eligible to invest
         */
    }

    // FIELDS

    // Methods fields
    mapping (address => Identity) public identities;

    // METHODS
    // PUBLIC METHODS

    /// @notice Creates attestation for a participant
    /// @dev Maintainer of above identities mapping (== owner) can trigger this function
    /// @param ofParticipant Address of the participant to have attested
    function attestForIdentity(address ofParticipant)
        pre_cond(isOwner())
    {
        identities[ofParticipant].isEligible = true;
    }

    /// @notice Removes attestation for a participant
    /// @dev Maintainer of above identities mapping (== owner) can trigger this function
    /// @param ofParticipant Address of the participant to have attestation removed
    function removeAttestation(address ofParticipant)
        pre_cond(isOwner())
    {
        identities[ofParticipant].isEligible = false;
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
        return identities[ofParticipant].isEligible; // Eligible iff has uPort identity
    }

    /// @notice Checks whether redemption is permitted for a participant
    /// @param ofParticipant Address requesting to redeem from a Melon fund
    /// @param shareQuantity Quantity of shares times 10 ** 18 offered to redeem
    /// @param receiveQuantity Quantity of Melon token times 10 ** 18 requested to receive for shareQuantity
    /// @return Whether identity is eligible to redeem from a Melon fund.
    function isRedemptionPermitted(
        address ofParticipant,
        uint256 shareQuantity,
        uint256 receiveQuantity
    )
        view
        returns (bool)
    {
        return true; // No need for KYC/AML in case of redeeming shares
    }
}
