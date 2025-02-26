// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Foundation <security@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.8.19;

/// @title AaveV3DebtPositionDataDecoder Contract
/// @author Enzyme Foundation <security@enzyme.finance>
/// @notice Abstract contract containing data decodings for AaveV3DebtPosition payloads
abstract contract AaveV3DebtPositionDataDecoder {
    /// @dev Helper to decode args used during the AddCollateral action
    function __decodeAddCollateralActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (address[] memory aTokens_, uint256[] memory amounts_, bool fromUnderlying_)
    {
        return abi.decode(_actionArgs, (address[], uint256[], bool));
    }

    /// @dev Helper to decode args used during the Borrow action
    function __decodeBorrowActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (address[] memory underlyings_, uint256[] memory amounts_)
    {
        return abi.decode(_actionArgs, (address[], uint256[]));
    }

    /// @dev Helper to decode args used during the RemoveCollateral action
    function __decodeRemoveCollateralActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (address[] memory aTokens_, uint256[] memory amounts_, bool toUnderlying_)
    {
        return abi.decode(_actionArgs, (address[], uint256[], bool));
    }

    /// @dev Helper to decode args used during the RepayBorrow action
    function __decodeRepayBorrowActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (address[] memory underlyings_, uint256[] memory amounts_)
    {
        return abi.decode(_actionArgs, (address[], uint256[]));
    }

    /// @dev Helper to decode args used during the SetEMode action
    function __decodeSetEModeActionArgs(bytes memory _actionArgs) internal pure returns (uint8 categoryId_) {
        return abi.decode(_actionArgs, (uint8));
    }

    /// @dev Helper to decode args used during the SetUseReserveAsCollateral action
    function __decodeSetUseReserveAsCollateralActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (address underlying_, bool useAsCollateral_)
    {
        return abi.decode(_actionArgs, (address, bool));
    }

    /// @dev Helper to decode args used during the ClaimRewards action
    function __decodeClaimRewardsActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (address[] memory assets_, uint256 amount_, address rewardToken_)
    {
        return abi.decode(_actionArgs, (address[], uint256, address));
    }

    /// @dev Helper to decode args used during the Sweep action
    function __decodeSweepActionArgs(bytes memory _actionArgs) internal pure returns (address[] memory assets_) {
        return abi.decode(_actionArgs, (address[]));
    }

    /// @dev Helper to decode args used during the ClaimMerklRewards action
    function __decodeClaimMerklRewardsActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (address[] memory tokens_, uint256[] memory amounts_, bytes32[][] memory proofs_)
    {
        return abi.decode(_actionArgs, (address[], uint256[], bytes32[][]));
    }
}
