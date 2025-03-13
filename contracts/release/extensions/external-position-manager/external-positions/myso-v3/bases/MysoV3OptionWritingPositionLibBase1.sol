// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

/// @title MysoV3OptionWritingPositionLibBase1 Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice A persistent contract containing all required storage variables and
/// required functions for a MysoV3OptionWritingPositionLib implementation
/// @dev DO NOT EDIT CONTRACT. If new events or storage are necessary, they should be added to
/// a numbered MysoV3OptionWritingPositionLibBaseXXX that inherits the previous base.
/// e.g., `MysoV3OptionWritingPositionLibBase2 is MysoV3OptionWritingPositionLibBase1`
abstract contract MysoV3OptionWritingPositionLibBase1 {
    /// @dev emits the newly created escrow index
    event EscrowCreated(uint256 escrowIdx);
    /// @dev emits which escrow index was closed and swept
    event EscrowClosedAndSwept(uint256 escrowIdx);

    /// @dev tracks the linked escrow indices; this helps track which escrows
    // are managed by the EP and for which the EP has open/unsettled written
    // options and which the fund admin will need to sweep/finalize;
    // Note: associated escrow addresses can be retrieved from the router
    // via function getEscrows
    uint32[] internal openEscrowsIdxs;
}
