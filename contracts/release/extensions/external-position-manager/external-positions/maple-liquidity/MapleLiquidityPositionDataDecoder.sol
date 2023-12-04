// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title MapleLiquidityPositionDataDecoder Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Abstract contract containing data decodings for MapleLiquidityPosition payloads
abstract contract MapleLiquidityPositionDataDecoder {
    /// @dev Helper to decode args used during the CancelRedeemV2 action
    function __decodeCancelRedeemV2ActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (address pool_, uint256 poolTokenAmount_)
    {
        return abi.decode(_actionArgs, (address, uint256));
    }

    /// @dev Helper to decode args used during the LendV2 action
    function __decodeLendV2ActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (address pool_, uint256 liquidityAssetAmount_)
    {
        return abi.decode(_actionArgs, (address, uint256));
    }

    /// @dev Helper to decode args used during the RedeemV2 action
    function __decodeRedeemV2ActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (address pool_, uint256 poolTokenAmount_)
    {
        return abi.decode(_actionArgs, (address, uint256));
    }

    /// @dev Helper to decode args used during the RequestRedeemV2 action
    function __decodeRequestRedeemV2ActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (address pool_, uint256 poolTokenAmount_)
    {
        return abi.decode(_actionArgs, (address, uint256));
    }
}
