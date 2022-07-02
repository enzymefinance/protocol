// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title NotionalV2PositionDataDecoder Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Abstract contract containing data decodings for NotionalV2Position payloads
abstract contract NotionalV2PositionDataDecoder {
    /// @dev Helper to decode args used during the AddCollateral action
    function __decodeAddCollateralActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (uint16 currencyId_, uint256 collateralAssetAmount_)
    {
        return abi.decode(_actionArgs, (uint16, uint256));
    }

    /// @dev Helper to decode args used during the Borrow action
    function __decodeBorrowActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (
            uint16 borrowCurrencyId_,
            bytes32 encodedBorrowTrade_,
            uint16 collateralCurrencyId_,
            uint256 collateralAssetAmount_
        )
    {
        return abi.decode(_actionArgs, (uint16, bytes32, uint16, uint256));
    }

    /// @dev Helper to decode args used during the Lend action
    function __decodeLendActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (
            uint16 currencyId_,
            uint256 underlyingTokenAmount_,
            bytes32 encodedLendTrade_
        )
    {
        return abi.decode(_actionArgs, (uint16, uint256, bytes32));
    }

    /// @dev Helper to decode args used during the Redeem action
    function __decodeRedeemActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (uint16 currencyId_, uint88 yieldTokenAmount_)
    {
        return abi.decode(_actionArgs, (uint16, uint88));
    }
}
