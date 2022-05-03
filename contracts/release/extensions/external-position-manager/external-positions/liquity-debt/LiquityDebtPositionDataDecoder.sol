// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title LiquityDebtPositionDataDecoder Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Abstract contract containing data decodings for LiquityDebtPosition payloads
abstract contract LiquityDebtPositionDataDecoder {
    /// @dev Helper to decode args used during the AddCollateral action
    function __decodeAddCollateralActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (
            uint256 collateralAmount_,
            address upperHint_,
            address lowerHint_
        )
    {
        return abi.decode(_actionArgs, (uint256, address, address));
    }

    /// @dev Helper to decode args used during the Borrow action
    function __decodeBorrowActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (
            uint256 maxFeePercentage_,
            uint256 lusdAmount_,
            address upperHint_,
            address lowerHint_
        )
    {
        return abi.decode(_actionArgs, (uint256, uint256, address, address));
    }

    /// @dev Helper to decode args used during the CloseTrove action
    function __decodeCloseTroveActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (uint256 lusdAmount_)
    {
        return abi.decode(_actionArgs, (uint256));
    }

    /// @dev Helper to decode args used during the OpenTrove action
    function __decodeOpenTroveArgs(bytes memory _actionArgs)
        internal
        pure
        returns (
            uint256 maxFeePercentage_,
            uint256 collateralAmount_,
            uint256 lusdAmount_,
            address upperHint_,
            address lowerHint_
        )
    {
        return abi.decode(_actionArgs, (uint256, uint256, uint256, address, address));
    }

    /// @dev Helper to decode args used during the RemoveCollateral action
    function __decodeRemoveCollateralActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (
            uint256 collateralAmount_,
            address upperHint_,
            address lowerHint_
        )
    {
        return abi.decode(_actionArgs, (uint256, address, address));
    }

    /// @dev Helper to decode args used during the RepayBorrow action
    function __decodeRepayBorrowActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (
            uint256 lusdAmount_,
            address upperHint_,
            address lowerHint_
        )
    {
        return abi.decode(_actionArgs, (uint256, address, address));
    }
}
