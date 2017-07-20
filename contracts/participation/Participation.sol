pragma solidity ^0.4.11;

import "./ParticipationProtocol.sol";
import "../dependencies/DBC.sol";
import "../assets/EtherToken.sol";
import "../VaultProtocol.sol";


/// @title Participation Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple and static Participation Module.
contract Participation is ParticipationProtocol, DBC {

    // FIELDS

    // PRE, POST, INVARIANT CONDITIONS

    function isPastZero(uint x) internal returns (bool) { return 0 < x; }
    function isAtLeast(uint x, uint y) internal returns (bool) { return x >= y; }

    // CONSTANT METHODS

    // NON-CONSTANT METHODS

    function isSubscribePermitted(address byParticipant, uint wantedShares) returns (bool) {
        // Restrict to certain addresses, amounts or timeintervalls
        return true;
    }

    function isRedeemPermitted(address byParticipant, uint wantedShares) returns (bool) {
        // Restrict to certain addresses, amounts or timeintervalls
        return true;
    }
}
