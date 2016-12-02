pragma solidity ^0.4.4;

import "./PerformanceFeeProtocol.sol";
import "../dependencies/Owned.sol";


/// @title Price Feed Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple and static Performance Fee.
contract PerformanceFee is PerformanceFeeProtocol, Owned {

    // FILEDS

    uint public fee = 0;

    // EVENTS

    // MODIFIERS

    // CONSTANT METHODS

    function calculateFee() only_owner constant returns (uint) { return fee; }

    // NON-CONSTANT METHODS

    function PerformanceFee() {}

}
