pragma solidity ^0.4.11;

import "../dependencies/DBC.sol";
import "./RewardsProtocol.sol";

/// @title Rewards Contract
/// @author Melonport AG <team@melonport.com>
/// @notice Simple and static Rewards.
contract Rewards is DBC, RewardsProtocol {

    // FIELDS

    // Constant asset specific fields
    uint public managementRewardRate = 0; // Reward rate in referenceAsset per delta improvment
    uint public performanceRewardRate = 0; // Reward rate in referenceAsset per managed seconds

    // PerformanceReward
    uint public constant DIVISOR_FEE = 10 ** 15; // Reward are divided by this number

    // EVENTS

    // MODIFIERS

    // CONSTANT METHODS

    // NON-CONSTANT METHODS

    function Rewards(uint withManagementRewardRate, uint withPerformanceRewardRate) {
        managementRewardRate = withManagementRewardRate;
        performanceRewardRate = withPerformanceRewardRate;
    }

}
