// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title IAaveAToken interface
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Common Aave aToken interface for V2 and V3
interface IAaveAToken {
    function UNDERLYING_ASSET_ADDRESS() external view returns (address underlying_);
}
