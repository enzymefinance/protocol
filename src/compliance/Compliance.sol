pragma solidity ^0.4.17;

import '../dependencies/DBC.sol';
import '../dependencies/Owned.sol';
import './ComplianceInterface.sol';

/// @title Compliance Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Example for uPort, Zug Gov, Melonport collaboration
contract Compliance is ComplianceInterface, DBC, Owned {

    // TYPES

    struct Identity { // Using uPort and attestation from Zug Government
        bool hasUportId; // Whether identiy has registered a uPort identity w Zug Gov
        /* .. additional information
         *   for example how much identity is eligible to invest
         */
    }

    // FIELDS

    // Methods fields
    mapping (address => Identity) public identities;

    // CONSTANT METHODS

    /// @notice Checks whether subscription is permitted for a participant
    /// @param ofParticipant Address requesting to invest in a Melon fund
    /// @param giveQuantity Quantity of Melon token times 10 ** 18 offered to receive shareQuantity
    /// @param shareQuantity Quantity of shares times 10 ** 18 requested to be received
    /// @return isEligible Whether identity is eligible to invest in a Melon fund.
    function isSubscriptionPermitted(
        address ofParticipant,
        uint256 giveQuantity,
        uint256 shareQuantity
    )
        returns (bool isEligible)
    {
        isEligible = identities[ofParticipant].hasUportId; // Eligible iff has uPort identity
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
        returns (bool isEligible)
    {
        isEligible = true; // No need for KYC/AML in case of redeeming shares
    }

    // NON-CONSTANT METHODS

    /// @notice Creates attestation for a participant
    /// @dev Maintainer of above identities mapping (== owner) can trigger this function
    /// @param ofParticipant Address of the participant to have attested
    function attestForIdentity(address ofParticipant)
        pre_cond(isOwner())
    {
        identities[ofParticipant].hasUportId = true;
    }

    /// @notice Removes attestation for a participant
    /// @dev Maintainer of above identities mapping (== owner) can trigger this function
    /// @param ofParticipant Address of the participant to have attestation removed
    function removeAttestation(address ofParticipant)
        pre_cond(isOwner())
    {
        identities[ofParticipant].hasUportId = false;
    }
}
