// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.7.6;

/// @title UniswapV3LiquidityPositionDataDecoder Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Abstract contract containing data decodings for UniswapV3LiquidityPosition payloads
abstract contract UniswapV3LiquidityPositionDataDecoder {
    /// @dev Helper to decode args used during the AddLiquidity action
    function __decodeAddLiquidityActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (
            uint256 nftId_,
            uint256 amount0Desired_,
            uint256 amount1Desired_,
            uint256 amount0Min_,
            uint256 amount1Min_
        )
    {
        return abi.decode(_actionArgs, (uint256, uint256, uint256, uint256, uint256));
    }

    /// @dev Helper to decode args used during the Collect action
    function __decodeCollectActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (uint256 nftId_)
    {
        return abi.decode(_actionArgs, (uint256));
    }

    /// @dev Helper to decode args used during the Mint action
    function __decodeMintActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (
            address token0_,
            address token1_,
            uint24 fee_,
            int24 tickLower_,
            int24 tickUpper_,
            uint256 amount0Desired_,
            uint256 amount1Desired_,
            uint256 amount0Min_,
            uint256 amount1Min_
        )
    {
        return
            abi.decode(
                _actionArgs,
                (address, address, uint24, int24, int24, uint256, uint256, uint256, uint256)
            );
    }

    /// @dev Helper to decode args used during the Purge action
    function __decodePurgeActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (
            uint256 nftId_,
            uint128 liquidity_,
            uint256 amount0Min_,
            uint256 amount1Min_
        )
    {
        return abi.decode(_actionArgs, (uint256, uint128, uint256, uint256));
    }

    /// @dev Helper to decode args used during the RemoveLiquidity action
    function __decodeRemoveLiquidityActionArgs(bytes memory _actionArgs)
        internal
        pure
        returns (
            uint256 nftId_,
            uint128 liquidity_,
            uint256 amount0Min_,
            uint256 amount1Min_
        )
    {
        return abi.decode(_actionArgs, (uint256, uint128, uint256, uint256));
    }
}
