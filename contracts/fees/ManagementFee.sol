pragma solidity ^0.4.8;

import "./ManagementFeeProtocol.sol";
import "../dependencies/Owned.sol";


/// @title ManagementFee Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple time based ManagementFee.
contract ManagementFee is ManagementFeeProtocol, Owned {

    // FIELDS

    uint public fee = 0; // Fee in Ether per managed seconds
    uint public constant DIVISOR_FEE = 10 ** 15; // Fees are divided by this number

    // EVENTS

    // MODIFIERS

    // CONSTANT METHODS

    /* Function invariant
     *  for timeDifference == 0 => returns 0
     */
    // Fee measured in referenceAsset
    function calculateFee(uint timeDifference, uint gav)
        constant returns (uint)
    {
        uint absoluteChange = timeDifference * gav;
        return absoluteChange * fee / DIVISOR_FEE;
    }

    // NON-CONSTANT METHODS

    function ManagementFee() {}

}
