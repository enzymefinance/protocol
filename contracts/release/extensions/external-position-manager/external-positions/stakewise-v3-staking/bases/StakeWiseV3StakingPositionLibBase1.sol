// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

/// @title StakeWiseV3StakingPositionLibBase1 Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A persistent contract containing all required storage variables and
/// required functions for a StakeWiseV3StakingPositionLib implementation
/// @dev DO NOT EDIT CONTRACT. If new events or storage are necessary, they should be added to
/// a numbered StakeWiseV3StakingPositionLibBaseXXX that inherits the previous base.
/// e.g., `StakeWiseV3StakingPositionLibBase2 is StakeWiseV3StakingPositionLibBase1`
abstract contract StakeWiseV3StakingPositionLibBase1 {
    event ExitRequestAdded(
        address indexed stakeWiseVaultAddress, uint256 positionTicket, uint256 timestamp, uint256 sharesAmount
    );

    event ExitRequestRemoved(address indexed stakeWiseVaultAddress, uint256 positionTicket);

    event VaultTokenAdded(address indexed stakeWiseVaultAddress);

    event VaultTokenRemoved(address indexed stakeWiseVaultAddress);

    struct ExitRequest {
        address stakeWiseVaultAddress;
        uint256 positionTicket;
        uint256 timestamp;
        uint256 sharesAmount;
    }

    ExitRequest[] internal exitRequests;

    address[] internal stakeWiseVaultTokens;
}
