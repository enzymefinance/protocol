// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title ArbitraryLoanPositionLibBase1 Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A persistent contract containing all required storage variables and
/// required functions for a ArbitraryLoanPositionLib implementation
/// @dev DO NOT EDIT CONTRACT (with exception of OracleType noted below).
/// If new events or storage are necessary, they should be added to
/// a numbered ArbitraryLoanPositionLibBaseXXX that inherits the previous base.
/// e.g., `ArbitraryLoanPositionLibBase2 is ArbitraryLoanPositionLibBase1`
abstract contract ArbitraryLoanPositionLibBase1 {
    event BorrowableAmountUpdated(uint256 borrowableAmount);

    event LoanClosed();

    event LoanConfigured(
        address indexed borrower,
        address indexed loanAsset,
        address indexed accountingModule,
        bytes32 description
    );

    event TotalBorrowedUpdated(uint256 totalBorrowed);

    event TotalRepaidUpdated(uint256 totalRepaid);

    address internal accountingModule;
    address internal borrower;
    uint256 internal borrowableAmount;
    // Var packed
    uint128 internal totalBorrowed;
    uint128 internal totalRepaid;
    // Var packed
    address internal loanAsset;
    bool internal isClosed;
}
