// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title AaveDebtPositionDataDecoder Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Abstract contract containing data decodings for AaveDebtPosition payloads
abstract contract AaveDebtPositionDataDecoder {
    /// @dev Helper to decode args used during the AddCollateral action
    function __decodeAddCollateralActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (address[] memory aTokens_, uint256[] memory amounts_)
    {
        return abi.decode(_actionArgs, (address[], uint256[]));
    }

    /// @dev Helper to decode args used during the Borrow action
    function __decodeBorrowActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (address[] memory tokens_, uint256[] memory amounts_)
    {
        return abi.decode(_actionArgs, (address[], uint256[]));
    }

    /// @dev Helper to decode args used during the ClaimRewards action
    function __decodeClaimRewardsActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (address[] memory assets_)
    {
        return abi.decode(_actionArgs, (address[]));
    }

    /// @dev Helper to decode args used during the RemoveCollateral action
    function __decodeRemoveCollateralActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (address[] memory aTokens_, uint256[] memory amounts_)
    {
        return abi.decode(_actionArgs, (address[], uint256[]));
    }

    /// @dev Helper to decode args used during the RepayBorrow action
    function __decodeRepayBorrowActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (address[] memory tokens_, uint256[] memory amounts_)
    {
        return abi.decode(_actionArgs, (address[], uint256[]));
    }
}
