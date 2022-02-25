// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title IAaveAToken Interface
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Minimal interface for interactions with Aave tokens (aTokens)
interface IAaveAToken {
    function UNDERLYING_ASSET_ADDRESS() external returns (address);
}
