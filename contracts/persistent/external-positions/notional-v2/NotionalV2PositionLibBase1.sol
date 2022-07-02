// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title NotionalV2PositionLibBase1 Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A persistent contract containing all required storage variables and
/// required functions for a NotionalV2PositionLib implementation
/// @dev DO NOT EDIT CONTRACT. If new events or storage are necessary, they should be added to
/// a numbered NotionalV2PositionLibBaseXXX that inherits the previous base.
/// e.g., `NotionalV2PositionLibBase2 is NotionalV2PositionLibBase1`
abstract contract NotionalV2PositionLibBase1 {
    event BorrowingExternalPositionActivated();
    event BorrowingExternalPositionDeactivated();

    bool internal isBorrower;
}
