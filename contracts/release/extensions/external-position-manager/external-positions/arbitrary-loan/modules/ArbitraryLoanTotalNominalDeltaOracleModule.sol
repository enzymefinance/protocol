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
import "openzeppelin-solc-0.6/math/SignedSafeMath.sol";
import "./IArbitraryLoanAccountingModule.sol";
import "../../../../../../persistent/arbitrary-value-oracles/IArbitraryValueOracle.sol";

/// @title ArbitraryLoanTotalNominalDeltaOracleModule Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice An accounting module for a loan to apply gains or losses,
/// via an oracle that reports the nominal delta of the total amount borrowed (ignores repayments)
/// @dev This method of reporting value helps to prevent an oracle getting out-of-sync,
/// e.g., when new amounts are borrowed or repaid to the loan
contract ArbitraryLoanTotalNominalDeltaOracleModule is IArbitraryLoanAccountingModule {
    using SafeMath for uint256;
    using SignedSafeMath for int256;

    event OracleSetForLoan(address indexed loan, address indexed oracle, uint32 stalenessThreshold);

    struct OracleInfo {
        address oracle;
        uint32 stalenessThreshold;
    }

    mapping(address => OracleInfo) private loanToOracleInfo;

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
        return __calcLoanBalance(msg.sender, _totalBorrowed, _totalRepaid);
    }

    /// @notice Configures options per-loan
    /// @param _configData Encoded options
    function configure(bytes memory _configData) external override {
        address loan = msg.sender;
        (address oracle, uint32 stalenessThreshold) = abi.decode(_configData, (address, uint32));
        require(oracle != address(0), "configure: Empty oracle");

        loanToOracleInfo[loan] = OracleInfo({oracle: oracle, stalenessThreshold: stalenessThreshold});

        emit OracleSetForLoan(loan, oracle, stalenessThreshold);
    }

    /// @notice Implements logic immediately prior to effects and interactions during a borrow
    /// @dev Unimplemented
    function preBorrow(uint256, uint256, uint256) external override {}

    /// @notice Implements logic immediately prior to effects and interactions when closing a loan
    /// @dev Unimplemented
    function preClose(uint256, uint256) external override {}

    /// @notice Implements logic immediately prior to effects and interactions during a reconciliation,
    /// and returns the formatted amount to consider as a repayment
    /// @param _repayableLoanAssetAmount The loanAsset amount available for repayment
    /// @return repayAmount_ The formatted amount to consider as repayment in terms of the loanAsset
    /// @dev Should not revert in case of over-repayment.
    /// Instead, it is recommended to return the full loan balance as repayAmount_ where necessary.
    function preReconcile(uint256, uint256, uint256 _repayableLoanAssetAmount, address[] calldata)
        external
        override
        returns (uint256 repayAmount_)
    {
        return _repayableLoanAssetAmount;
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
        // Calc actual repay amount based on user input
        if (_repayAmountInput == type(uint256).max) {
            return __calcLoanBalance(msg.sender, _totalBorrowed, _prevTotalRepaid);
        }

        return _repayAmountInput;
    }

    /// @notice Receives and executes an arbitrary call from the loan contract
    /// @dev No actions implemented in this module
    function receiveCallFromLoan(bytes memory) external override {
        revert("receiveCallFromLoan: Invalid actionId");
    }

    // PRIVATE FUNCTIONS

    /// @dev Helper to calculate the loan balance
    function __calcLoanBalance(address _loan, uint256 _totalBorrowed, uint256 _totalRepaid)
        private
        view
        returns (uint256 balance_)
    {
        OracleInfo memory oracleInfo = getOracleInfoForLoan(_loan);
        int256 oracleValue;

        // Query value and handle staleness threshold as-necessary
        if (oracleInfo.stalenessThreshold > 0) {
            uint256 lastUpdated;
            (oracleValue, lastUpdated) = IArbitraryValueOracle(oracleInfo.oracle).getValueWithTimestamp();

            // Does not assert the staleness threshold if the oracle value is 0
            require(
                oracleInfo.stalenessThreshold >= block.timestamp.sub(lastUpdated) || oracleValue == 0,
                "calcFaceValue: Stale oracle"
            );
        } else {
            oracleValue = IArbitraryValueOracle(oracleInfo.oracle).getValue();
        }

        int256 totalBalanceInt = int256(_totalBorrowed).add(oracleValue).sub(int256(_totalRepaid));
        if (totalBalanceInt > 0) {
            return uint256(totalBalanceInt);
        }

        return 0;
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the OracleInfo for a given loan
    /// @param _loan The loan address
    /// @return oracleInfo_ The oracle info
    function getOracleInfoForLoan(address _loan) public view returns (OracleInfo memory oracleInfo_) {
        return loanToOracleInfo[_loan];
    }
}
