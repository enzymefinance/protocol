pragma solidity ^0.4.11;

import './ParticipationInterface.sol';
import '../dependencies/DBC.sol';


/// @title Participation Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple and static Participation Module.
contract Participation is ParticipationInterface, DBC {

    // NON-CONSTANT BOOLEAN METHODS

    /// Pre: Request ID
    /// Post: Boolean dependent on market data
    /// Post: Boolean dependent on personel data; Compliance
    function isSubscribeRequestPermitted(uint id) returns (bool) {
        // Restrict to certain addresses, amounts or timeintervalls
        return true;
    }

    // Pre: Request ID
    // Post: Boolean whether permitted or not
    function isRedeemRequestPermitted(uint id) returns (bool) {
        return true;
    }
}
