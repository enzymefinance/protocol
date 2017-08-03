pragma solidity ^0.4.11;

/// @title Rewards Protocol Contract
/// @author Melonport AG <team@melonport.com>
/// @notice This is to be considered as a protocol on how to access the underlying Rewards Contract
contract RewardsProtocol {

    // VARIABLES
    uint public managementRewardRate;
    uint public performanceRewardRate;
    uint public DIVISOR_FEE;
    // CONSTANT METHODS
    function calculateManagementReward(uint timeDifference, uint gav) constant returns (uint) {}
    function calculatePerformanceReward(uint sharePriceDifference, uint totalSupply) constant returns (uint) {}

}
