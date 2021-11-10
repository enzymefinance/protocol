// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.7.6;

/// @title UniswapV3LiquidityPositionLibBase1 Contract
/// @author Enzyme Council <security@enzyme.finance>
/// @notice A persistent contract containing all required storage variables and
/// required functions for a UniswapV3LiquidityPositionLib implementation
/// @dev DO NOT EDIT CONTRACT. If new events or storage are necessary, they should be added to
/// a numbered UniswapV3LiquidityPositionLibBaseXXX that inherits the previous base.
/// e.g., `UniswapV3LiquidityPositionLibBase2 is UniswapV3LiquidityPositionLibBase1`
abstract contract UniswapV3LiquidityPositionLibBase1 {
    event Initialized(address token0, address token1);

    event NFTPositionAdded(uint256 indexed tokenId);

    event NFTPositionRemoved(uint256 indexed tokenId);

    uint256[] internal nftIds;
    // token0 and token1 are assigned deterministically by sort order,
    // so will be the same for all fees
    address internal token0;
    address internal token1;
}
