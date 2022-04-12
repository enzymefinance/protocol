// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title ITestTheGraphEpochManager Interface
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A test interface for TheGraph Epoch Manager contract
interface ITestTheGraphEpochManager {
    function currentEpoch() external view returns (uint256);

    function runEpoch() external;

    function setEpochLength(uint256 _epochLength) external;
}
