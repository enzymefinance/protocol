// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

/// @title PendleV2PositionLibBase1 Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A persistent contract containing all required storage variables and
/// required functions for a PendleV2PositionLib implementation
/// @dev DO NOT EDIT CONTRACT. If new events or storage are necessary, they should be added to
/// a numbered PendleV2PositionLibBaseXXX that inherits the previous base.
/// e.g., `PendleV2PositionLibBase2 is PendleV2PositionLibBase1`
abstract contract PendleV2PositionLibBase1 {
    event PrincipalTokenAdded(address indexed principalToken, address indexed market);

    event PrincipalTokenRemoved(address indexed principalToken);

    event LpTokenAdded(address indexed lpToken);

    event LpTokenRemoved(address indexed lpToken);

    event OracleDurationForMarketAdded(address indexed market, uint32 indexed pricingDuration);

    address[] internal principalTokens;

    address[] internal lpTokens;

    mapping(address principalToken => address market) internal principalTokenToMarket;

    mapping(address market => uint32 pricingDuration) internal marketToOraclePricingDuration;
}
