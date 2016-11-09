pragma solidity ^0.4.4;

import "./PerformanceFeeProtocol.sol";

/// @title Price Feed Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple and static Performance Fee.
contract PerformanceFee is PerformanceFeeProtocol {

    modifier ifOwner() { if(msg.sender != owner) throw; _; }

    function PerformanceFee() {
        owner = msg.sender;
        fee = 0;
    }
    function () { throw; }

    function calculatePerformanceFee() ifOwner returns (uint) { return 0; }
}
