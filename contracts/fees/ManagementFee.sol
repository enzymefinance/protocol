pragma solidity ^0.4.8;

import "./ManagementFeeProtocol.sol";
import "../dependencies/Owned.sol";


/// @title ManagementFee Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple time based ManagementFee.
contract ManagementFee is ManagementFeeProtocol, Owned {

    // FIELDS

    uint public fee = 0; // Fee in Ether per managed seconds

    // EVENTS

    // MODIFIERS

    // CONSTANT METHODS

    function calculateFee(uint timeDifference)
        constant returns (uint)
    {
        return timeDifference * fee;
    }

    // NON-CONSTANT METHODS

    function ManagementFee() {}

}
