pragma solidity ^0.4.8;

import "./ManagementFeeProtocol.sol";
import "../dependencies/Owned.sol";


/// @title ManagementFee Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple and static ManagementFee.
contract ManagementFee is ManagementFeeProtocol, Owned {

    // FIELDS

    uint public fee = 0;

    // EVENTS

    // MODIFIERS

    // CONSTANT METHODS

    function calculateFee() only_owner constant returns (uint) { return fee; }

    // NON-CONSTANT METHODS

    function ManagementFee() {}

}
