// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

/// @title LidoWithdrawalsPositionLibBase1 Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A persistent contract containing all storage variables, events, and data structures
/// @dev DO NOT EDIT CONTRACT. If new events or storage are necessary,
/// a new contract should inherit the most recent base.
contract LidoWithdrawalsPositionLibBase1 {
    struct Request {
        uint128 amount;
        uint128 id;
    }

    event RequestAdded(uint256 indexed id, uint256 amount);

    event RequestRemoved(uint256 indexed id);

    Request[] internal requests;
}
