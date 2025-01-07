// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

/// @title PendleV2PositionLibBase1 Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice A persistent contract containing all required storage variables and
/// required functions for a PendleV2PositionLib implementation
abstract contract PendleV2PositionLibBase1 {
    event MigratedToVault();

    event PrincipalTokenAdded(address indexed principalToken);

    event PrincipalTokenRemoved(address indexed principalToken);

    event LpTokenAdded(address indexed lpToken);

    event LpTokenRemoved(address indexed lpToken);

    address[] internal principalTokens;

    address[] internal lpTokens;
}
