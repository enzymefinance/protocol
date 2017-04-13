pragma solidity ^0.4.8;

import "./PerformanceFeeProtocol.sol";
import "../dependencies/Owned.sol";


/// @title PerformanceFee Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple and static PerformanceFee.
contract PerformanceFee is PerformanceFeeProtocol, Owned {

    // FIELDS

    uint public fee = 0; // Fee in Ether per delta improvment
    uint public constant DIVISOR_FEE = 10000; // Fees are divided by this number; Results to one basis point

    // EVENTS

    // MODIFIERS

    // CONSTANT METHODS

    /* Function invariant
     *  for deltaDifference == 0 => returns 0
     */
    // Fee measured in referenceAsset
    function calculateFee(uint deltaDifference, uint gav)
        constant returns (uint)
    {
        if (deltaDifference <= 0) return 0;
        uint absoluteChange = (deltaDifference) * gav;
        return absoluteChange * fee / DIVISOR_FEE;
    }

    // NON-CONSTANT METHODS

    function PerformanceFee() {}

}
