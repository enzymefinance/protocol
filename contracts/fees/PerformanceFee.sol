pragma solidity ^0.4.8;

import "./PerformanceFeeProtocol.sol";
import "../dependencies/Owned.sol";


/// @title PerformanceFee Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple and static PerformanceFee.
contract PerformanceFee is PerformanceFeeProtocol, Owned {

    // FIELDS

    uint public fee = 0; // Fee in Ether per delta improvment (TODO define better)

    // EVENTS

    // MODIFIERS

    // CONSTANT METHODS

    function calculateFee(uint relativeDelta)
        constant returns (uint)
    {
        return relativeDelta * fee;
    }

    // NON-CONSTANT METHODS

    function PerformanceFee() {}

}
