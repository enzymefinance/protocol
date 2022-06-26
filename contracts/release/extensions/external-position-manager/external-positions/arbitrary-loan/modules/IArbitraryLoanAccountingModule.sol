// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title IArbitraryLoanAccountingModule Interface
/// @author Enzyme Council <security@enzyme.finance>
interface IArbitraryLoanAccountingModule {
    /// @notice Calculates the canonical face value of the loan
    /// @param _totalBorrowed The total borrowed amount
    /// @param _totalRepaid The total repaid amount
    /// @return faceValue_ The face value
    function calcFaceValue(uint256 _totalBorrowed, uint256 _totalRepaid)
        external
        view
        returns (uint256 faceValue_);

    /// @notice Configures options per-loan
    /// @param _configData Encoded options
    function configure(bytes memory _configData) external;

    /// @notice Implements logic immediately prior to effects and interactions during a borrow
    /// @param _prevTotalBorrowed The total borrowed amount not including the new borrow amount
    /// @param _totalRepaid The total repaid amount
    /// @param _borrowAmount The new borrow amount
    function preBorrow(
        uint256 _prevTotalBorrowed,
        uint256 _totalRepaid,
        uint256 _borrowAmount
    ) external;

    /// @notice Implements logic immediately prior to effects and interactions when closing a loan
    /// @param _totalBorrowed The total borrowed amount
    /// @param _totalRepaid The total repaid amount
    function preClose(uint256 _totalBorrowed, uint256 _totalRepaid) external;

    /// @notice Implements logic immediately prior to effects and interactions during a reconciliation,
    /// and returns the formatted amount to consider as a repayment
    /// @param _totalBorrowed The total borrowed amount
    /// @param _prevTotalRepaid The total repaid amount not including the reconciled assets
    /// @param _repayableLoanAssetAmount The loanAsset amount available for repayment
    /// @param _extraAssets The extra assets (non-loanAsset) being swept to the VaultProxy
    /// @return repayAmount_ The formatted amount to consider as repayment in terms of the loanAsset
    /// @dev Should not revert in case of over-repayment.
    /// Instead, it is recommended to return the full loan balance as repayAmount_ where necessary.
    /// _extraAssets allows a module to use its own pricing to calculate the value of each
    /// extra asset in terms of the loanAsset, which can be included in the repayAmount_.
    function preReconcile(
        uint256 _totalBorrowed,
        uint256 _prevTotalRepaid,
        uint256 _repayableLoanAssetAmount,
        address[] calldata _extraAssets
    ) external returns (uint256 repayAmount_);

    /// @notice Implements logic immediately prior to effects and interactions during a repay,
    /// and returns the formatted amount to repay (e.g., in the case of a user-input max)
    /// @param _totalBorrowed The total borrowed amount
    /// @param _prevTotalRepaid The total repaid amount not including the new repay amount
    /// @param _repayAmountInput The user-input repay amount
    /// @return repayAmount_ The formatted amount to repay
    function preRepay(
        uint256 _totalBorrowed,
        uint256 _prevTotalRepaid,
        uint256 _repayAmountInput
    ) external returns (uint256 repayAmount_);

    /// @notice Receives and executes an arbitrary call from the loan contract
    /// @param _actionData Encoded data for the arbitrary call
    function receiveCallFromLoan(bytes memory _actionData) external;
}
