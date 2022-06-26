// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title ArbitraryLoanPositionDataDecoder Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Abstract contract containing data decodings for ArbitraryLoanPosition payloads
abstract contract ArbitraryLoanPositionDataDecoder {
    /// @dev Helper to decode args used during the CloseLoan action
    function __decodeCloseLoanActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (address[] memory extraAssetsToSweep_)
    {
        return abi.decode(_actionArgs, (address[]));
    }

    /// @dev Helper to decode args used during the ConfigureLoan action
    function __decodeConfigureLoanActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (
            address borrower_,
            address asset_,
            uint256 amount_,
            address accountingModule_,
            bytes memory accountingModuleConfigData_,
            bytes32 description_
        )
    {
        return abi.decode(_actionArgs, (address, address, uint256, address, bytes, bytes32));
    }

    /// @dev Helper to decode args used during the Reconcile action
    function __decodeReconcileActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (address[] memory extraAssetsToSweep_)
    {
        return abi.decode(_actionArgs, (address[]));
    }

    /// @dev Helper to decode args used during the UpdateBorrowableAmount action
    function __decodeUpdateBorrowableAmountActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (int256 amountDelta_)
    {
        return abi.decode(_actionArgs, (int256));
    }
}
