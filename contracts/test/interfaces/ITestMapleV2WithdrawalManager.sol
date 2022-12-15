// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

/// @title ITestMapleV2WithdrawalManager Interface
/// @author Enzyme Council <security@enzyme.finance>
interface ITestMapleV2WithdrawalManager {
    struct CycleConfig {
        uint64 initialCycleId;
        uint64 initialCycleTime;
        uint64 cycleDuration;
        uint64 windowDuration;
    }

    function exitCycleId(address _owner) external view returns (uint256 exitCycleId_);

    function getCurrentConfig() external view returns (CycleConfig memory config_);

    function getWindowAtId(uint256 _cycleId)
        external
        view
        returns (uint256 windowStart_, uint256 windowEnd_);

    function lockedShares(address _account) external view returns (uint256 lockedShares_);
}
