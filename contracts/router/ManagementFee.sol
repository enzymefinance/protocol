pragma solidity ^0.4.4;

import "./ManagementFeeProtocol.sol";
import "../dependencies/Owned.sol";


/// @title Price Feed Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple and static Management Fee.
contract ManagementFee is ManagementFeeProtocol, Owned {

    // FILEDS

    uint public fee = 0;

    // EVENTS

    // MODIFIERS

    // CONSTANT METHODS

    function calculateFee() only_owner constant returns (uint) { return fee; }

    // NON-CONSTANT METHODS

    function ManagementFee() {}

}
