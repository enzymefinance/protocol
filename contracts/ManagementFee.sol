pragma solidity ^0.4.4;

import "./ManagementFeeProtocol.sol";

/// @title Price Feed Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple and static Management Fee.
contract ManagementFee is ManagementFeeProtocol {

    modifier ifOwner() { if(msg.sender != owner) throw; _; }

    function ManagementFee() {
        owner = msg.sender;
        fee = 0;
    }
    function () { throw; }

    function calculateManagementFee() ifOwner returns (uint) {}
}
