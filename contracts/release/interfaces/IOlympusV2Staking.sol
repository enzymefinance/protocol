// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title IOlympusV2Staking Helper Interface
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Minimal interface for our interactions with OlympusV2 Staking contracts
interface IOlympusV2Staking {
    function stake(
        address,
        uint256,
        bool,
        bool
    ) external;

    function unstake(
        address,
        uint256,
        bool,
        bool
    ) external;
}
