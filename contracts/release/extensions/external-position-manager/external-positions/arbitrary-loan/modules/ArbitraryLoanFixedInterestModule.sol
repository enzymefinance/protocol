// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "openzeppelin-solc-0.6/math/SafeMath.sol";
import "openzeppelin-solc-0.6/utils/SafeCast.sol";
import "../../../../../utils/MakerDaoMath.sol";
import "../../../../../utils/MathHelpers.sol";
import "./IArbitraryLoanAccountingModule.sol";

/// @title ArbitraryLoanFixedInterestModule Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice An accounting module for a loan to apply fixed interest tracking
contract ArbitraryLoanFixedInterestModule is IArbitraryLoanAccountingModule, MakerDaoMath, MathHelpers {
    using SafeCast for uint256;
    using SafeMath for uint256;

    enum RepaymentTrackingType {
        None,
        PrincipalFirst,
        InterestFirst
    }

    event ConfigSetForLoan(
        address indexed loan,
        uint256 scaledPerSecondRatePreMaturity,
        uint256 scaledPerSecondRatePostMaturity,
        uint256 maturity,
        RepaymentTrackingType repaymentTrackingType,
        bool faceValueIsPrincipalOnly
    );

    event TotalPrincipalRepaidUpdatedForLoan(address indexed loan, uint256 totalPrincipalRepaid);

    event TotalInterestUpdatedForLoan(address indexed loan, uint256 totalInterest);

    // The scaled rate representing 99.99% is under 1e28,
    // thus `uint96` (8e28) is sufficient for any reasonable interest rate
    struct AccountingInfo {
        // Var packed
        uint128 totalInterestCached;
        uint32 totalInterestCachedTimestamp;
        uint96 scaledPerSecondRatePreMaturity;
        // Var packed
        uint96 scaledPerSecondRatePostMaturity;
        uint32 maturity;
        // Squashed to uint112 (5e33) to fit remaining vars in one slot
        uint112 totalPrincipalRepaid;
        RepaymentTrackingType repaymentTrackingType;
        bool faceValueIsPrincipalOnly;
    }

    uint256 private constant INTEREST_SCALED_PER_SECOND_RATE_BASE = 10 ** 27;

    mapping(address => AccountingInfo) private loanToAccountingInfo;

    /////////////////////
    // CALLS FROM LOAN //
    /////////////////////

    /// @notice Calculates the canonical face value of the loan
    /// @param _totalBorrowed The total borrowed amount
    /// @param _totalRepaid The total repaid amount
    /// @return faceValue_ The face value
    function calcFaceValue(uint256 _totalBorrowed, uint256 _totalRepaid)
        external
        view
        override
        returns (uint256 faceValue_)
    {
        address loan = msg.sender;
        AccountingInfo memory accountingInfo = getAccountingInfoForLoan(loan);

        if (accountingInfo.faceValueIsPrincipalOnly) {
            return _totalBorrowed.sub(accountingInfo.totalPrincipalRepaid);
        }

        return __calcLoanBalance(
            _totalBorrowed,
            _totalRepaid,
            uint256(accountingInfo.totalInterestCached).add(__calcUncachedInterest(loan, _totalBorrowed, _totalRepaid))
        );
    }

    /// @notice Configures options per-loan
    /// @param _configData Encoded options
    function configure(bytes memory _configData) external override {
        address loan = msg.sender;
        (
            uint96 scaledPerSecondRatePreMaturity,
            uint96 scaledPerSecondRatePostMaturity,
            uint32 maturity,
            RepaymentTrackingType repaymentTrackingType,
            bool faceValueIsPrincipalOnly
        ) = abi.decode(_configData, (uint96, uint96, uint32, RepaymentTrackingType, bool));

        // Maturity should either be empty or in the future.
        // If empty, then force pre- and post-maturity rates to be the same for clarity.
        require(
            maturity > block.timestamp
                || (maturity == 0 && scaledPerSecondRatePreMaturity == scaledPerSecondRatePostMaturity),
            "configure: Post-maturity rate without valid maturity"
        );

        // If using face value = principal only, must specify a method for tracking repayments
        require(
            !faceValueIsPrincipalOnly || repaymentTrackingType != RepaymentTrackingType.None,
            "configure: Invalid face value config"
        );

        loanToAccountingInfo[loan] = AccountingInfo({
            totalInterestCached: 0,
            totalInterestCachedTimestamp: 0,
            scaledPerSecondRatePreMaturity: scaledPerSecondRatePreMaturity,
            scaledPerSecondRatePostMaturity: scaledPerSecondRatePostMaturity,
            maturity: maturity,
            totalPrincipalRepaid: 0,
            repaymentTrackingType: repaymentTrackingType,
            faceValueIsPrincipalOnly: faceValueIsPrincipalOnly
        });

        emit ConfigSetForLoan(
            loan,
            scaledPerSecondRatePreMaturity,
            scaledPerSecondRatePostMaturity,
            maturity,
            repaymentTrackingType,
            faceValueIsPrincipalOnly
        );
    }

    /// @notice Implements logic immediately prior to effects and interactions during a borrow
    /// @param _prevTotalBorrowed The total borrowed amount not including the new borrow amount
    /// @param _totalRepaid The total repaid amount
    function preBorrow(uint256 _prevTotalBorrowed, uint256 _totalRepaid, uint256) external override {
        __checkpointInterest(msg.sender, _prevTotalBorrowed, _totalRepaid);
    }

    /// @notice Implements logic immediately prior to effects and interactions when closing a loan
    /// @dev Unimplemented
    function preClose(uint256, uint256) external override {}

    /// @notice Implements logic immediately prior to effects and interactions during a reconciliation,
    /// and returns the formatted amount to consider as a repayment
    /// @param _totalBorrowed The total borrowed amount
    /// @param _prevTotalRepaid The total repaid amount not including the reconciled assets
    /// @param _repayableLoanAssetAmount The loanAsset amount available for repayment
    /// @return repayAmount_ The formatted amount to consider as repayment in terms of the loanAsset
    /// @dev Should not revert in case of over-repayment.
    /// Instead, it is recommended to return the full loan balance as repayAmount_ where necessary.
    function preReconcile(
        uint256 _totalBorrowed,
        uint256 _prevTotalRepaid,
        uint256 _repayableLoanAssetAmount,
        address[] calldata
    ) external override returns (uint256 repayAmount_) {
        address loan = msg.sender;

        __checkpointInterest(loan, _totalBorrowed, _prevTotalRepaid);

        uint256 loanBalance =
            __calcLoanBalance(_totalBorrowed, _prevTotalRepaid, getAccountingInfoForLoan(loan).totalInterestCached);

        if (_repayableLoanAssetAmount > loanBalance) {
            // Don't allow an overpayment, to keep principal-based face value sensible
            repayAmount_ = loanBalance;
        } else {
            repayAmount_ = _repayableLoanAssetAmount;
        }

        __reconcilePrincipalRepaid(loan, _totalBorrowed, _prevTotalRepaid, repayAmount_);

        return repayAmount_;
    }

    /// @notice Implements logic immediately prior to effects and interactions during a repay,
    /// and returns the formatted amount to repay (e.g., in the case of a user-input max)
    /// @param _totalBorrowed The total borrowed amount
    /// @param _prevTotalRepaid The total repaid amount not including the new repay amount
    /// @param _repayAmountInput The user-input repay amount
    /// @param repayAmount_ The formatted amount to repay
    function preRepay(uint256 _totalBorrowed, uint256 _prevTotalRepaid, uint256 _repayAmountInput)
        external
        override
        returns (uint256 repayAmount_)
    {
        address loan = msg.sender;

        __checkpointInterest(loan, _totalBorrowed, _prevTotalRepaid);

        uint256 loanBalance =
            __calcLoanBalance(_totalBorrowed, _prevTotalRepaid, getAccountingInfoForLoan(loan).totalInterestCached);

        // Calc actual repay amount based on user input
        if (_repayAmountInput == type(uint256).max) {
            repayAmount_ = loanBalance;
        } else {
            // Don't allow an overpayment, to keep principal-based face value sensible
            require(_repayAmountInput <= loanBalance, "preRepay: Overpayment");

            repayAmount_ = _repayAmountInput;
        }

        __reconcilePrincipalRepaid(loan, _totalBorrowed, _prevTotalRepaid, repayAmount_);

        return repayAmount_;
    }

    /// @notice Receives and executes an arbitrary call from the loan contract
    /// @dev No actions implemented in this module
    function receiveCallFromLoan(bytes memory) external override {
        revert("receiveCallFromLoan: Invalid actionId");
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to checkpoint total interest
    function __checkpointInterest(address _loan, uint256 _totalBorrowed, uint256 _totalRepaid) private {
        AccountingInfo storage accountingInfo = loanToAccountingInfo[_loan];

        uint256 uncachedInterest = __calcUncachedInterest(_loan, _totalBorrowed, _totalRepaid);
        if (uncachedInterest > 0) {
            uint256 totalInterest = uint256(accountingInfo.totalInterestCached).add(uncachedInterest);

            accountingInfo.totalInterestCached = totalInterest.toUint128();

            emit TotalInterestUpdatedForLoan(_loan, totalInterest);
        }

        // Always updating the cache timestamp guarantees distinct interest periods are upheld
        accountingInfo.totalInterestCachedTimestamp = uint32(block.timestamp);
    }

    /// @dev Helper to reconcile the amount of a loan's principal that has been repaid during a repayment.
    /// Called after checkpointing interest.
    function __reconcilePrincipalRepaid(
        address _loan,
        uint256 _totalBorrowed,
        uint256 _prevTotalRepaid,
        uint256 _repayAmount
    ) private {
        AccountingInfo memory accountingInfo = getAccountingInfoForLoan(_loan);

        if (accountingInfo.repaymentTrackingType == RepaymentTrackingType.None) {
            return;
        }

        uint256 principalOutstanding = _totalBorrowed.sub(accountingInfo.totalPrincipalRepaid);
        if (principalOutstanding == 0) {
            return;
        }

        uint256 nextTotalPrincipalRepaid;
        if (accountingInfo.repaymentTrackingType == RepaymentTrackingType.PrincipalFirst) {
            // Simulate the effect of repaying the principal before interest

            if (_repayAmount >= principalOutstanding) {
                nextTotalPrincipalRepaid = _totalBorrowed;
            } else {
                nextTotalPrincipalRepaid = uint256(accountingInfo.totalPrincipalRepaid).add(_repayAmount);
            }
        } else {
            // RepaymentTrackingType.InterestFirst
            // Simulate the effect of repaying interest before the principal

            // totalInterestCached is already updated
            uint256 prevLoanBalance =
                __calcLoanBalance(_totalBorrowed, _prevTotalRepaid, accountingInfo.totalInterestCached);

            if (_repayAmount >= prevLoanBalance) {
                // Repayment covers full remaining balance
                nextTotalPrincipalRepaid = _totalBorrowed;
            } else {
                // Some of repayment amount is interest
                uint256 interestRemaining = prevLoanBalance.sub(principalOutstanding);

                if (_repayAmount > interestRemaining) {
                    nextTotalPrincipalRepaid =
                        uint256(accountingInfo.totalPrincipalRepaid).add(_repayAmount).sub(interestRemaining);
                }
            }
        }

        if (nextTotalPrincipalRepaid > 0) {
            loanToAccountingInfo[_loan].totalPrincipalRepaid = __safeCastUint112(nextTotalPrincipalRepaid);

            emit TotalPrincipalRepaidUpdatedForLoan(_loan, nextTotalPrincipalRepaid);
        }
    }

    /// @dev Mimics SafeCast logic for uint112
    function __safeCastUint112(uint256 value) private pure returns (uint112 castedValue_) {
        require(value < 2 ** 112, "__safeCastUint112: Value doesn't fit in 112 bits");

        return uint112(value);
    }

    ////////////////
    // LOAN VALUE //
    ////////////////

    /// @dev Helper to calculate continuously-compounded (per-second) interest
    function __calcContinuouslyCompoundedInterest(
        uint256 _loanBalance,
        uint256 _scaledPerSecondRate,
        uint256 _secondsSinceCheckpoint
    ) private pure returns (uint256 interest_) {
        if (_scaledPerSecondRate == 0) {
            return 0;
        }

        return _loanBalance.mul(
            __rpow(_scaledPerSecondRate, _secondsSinceCheckpoint, INTEREST_SCALED_PER_SECOND_RATE_BASE).sub(
                INTEREST_SCALED_PER_SECOND_RATE_BASE
            )
        ).div(INTEREST_SCALED_PER_SECOND_RATE_BASE);
    }

    /// @dev Helper to calculate the total loan balance. Ignores over-repayment.
    function __calcLoanBalance(uint256 _totalBorrowed, uint256 _totalRepaid, uint256 _totalInterest)
        private
        pure
        returns (uint256 balance_)
    {
        return __subOrZero(_totalBorrowed.add(_totalInterest), _totalRepaid);
    }

    /// @dev Helper to calculate uncached interest
    function __calcUncachedInterest(address _loan, uint256 _totalBorrowed, uint256 _totalRepaid)
        private
        view
        returns (uint256 uncachedInterest_)
    {
        AccountingInfo memory accountingInfo = getAccountingInfoForLoan(_loan);

        if (accountingInfo.totalInterestCachedTimestamp == block.timestamp) {
            return 0;
        }

        uint256 loanBalanceAtCheckpoint =
            __subOrZero(_totalBorrowed.add(accountingInfo.totalInterestCached), _totalRepaid);
        if (loanBalanceAtCheckpoint == 0) {
            return 0;
        }

        // At this point, there is some loan balance and amount of seconds

        // Use pre-maturity rate if immature or same rates.
        // If maturity == 0, rates will be the same.
        if (
            block.timestamp <= accountingInfo.maturity
                || accountingInfo.scaledPerSecondRatePreMaturity == accountingInfo.scaledPerSecondRatePostMaturity
        ) {
            return __calcContinuouslyCompoundedInterest(
                loanBalanceAtCheckpoint,
                accountingInfo.scaledPerSecondRatePreMaturity,
                block.timestamp.sub(accountingInfo.totalInterestCachedTimestamp)
            );
        }

        // Use post-maturity rate if last checkpoint was also beyond maturity
        if (accountingInfo.totalInterestCachedTimestamp >= accountingInfo.maturity) {
            return __calcContinuouslyCompoundedInterest(
                loanBalanceAtCheckpoint,
                accountingInfo.scaledPerSecondRatePostMaturity,
                block.timestamp.sub(accountingInfo.totalInterestCachedTimestamp)
            );
        }

        // At this point, block.timestamp != maturity and totalInterestCachedTimestamp != maturity

        // Otherwise, we need to bifurcate interest into pre- and post-maturity chunks
        uint256 preMaturityInterest = __calcContinuouslyCompoundedInterest(
            loanBalanceAtCheckpoint,
            accountingInfo.scaledPerSecondRatePreMaturity,
            uint256(accountingInfo.maturity).sub(accountingInfo.totalInterestCachedTimestamp)
        );

        uint256 postMaturityInterest = __calcContinuouslyCompoundedInterest(
            loanBalanceAtCheckpoint.add(preMaturityInterest),
            accountingInfo.scaledPerSecondRatePostMaturity,
            block.timestamp.sub(accountingInfo.maturity)
        );

        return preMaturityInterest.add(postMaturityInterest);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the AccountingInfo for a given loan
    /// @param _loan The loan address
    /// @return accountingInfo_ The accounting info
    function getAccountingInfoForLoan(address _loan) public view returns (AccountingInfo memory accountingInfo_) {
        return loanToAccountingInfo[_loan];
    }
}
