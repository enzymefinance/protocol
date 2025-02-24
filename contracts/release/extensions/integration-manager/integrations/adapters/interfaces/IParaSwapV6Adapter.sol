// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Foundation <security@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity >=0.6.0 <0.9.0;

/// @title IParaSwapV6Adapter interface
/// @author Enzyme Foundation <security@enzyme.finance>
interface IParaSwapV6Adapter {
    enum Action {
        SwapExactAmountIn,
        SwapExactAmountOut
    }

    /// @dev Inner swap data necessary to perform a swap on ParaSwapV6
    /// @param srcToken The source token
    /// @param destToken The destination token
    /// @param fromAmount The amount of srcToken to swap
    /// @param toAmount The amount of destToken to receive
    /// @param quotedAmount The amount of destToken to receive as quoted by ParaSwap
    /// @param metadata Arbitrary data (provided by ParaSwap's API)
    struct SwapData {
        address srcToken;
        address destToken;
        uint256 fromAmount;
        uint256 toAmount;
        uint256 quotedAmount;
        bytes32 metadata;
    }

    /// @dev Outer swap data necessary to perform a swap on ParaSwapV6
    /// @param executor The address that will execute the swap
    /// @param swapData The inner swap data
    /// @param partnerAndFee The partner and fee amount
    /// @param executorData Arbitrary data for the executor (provided by ParaSwap's API)
    struct SwapActionArgs {
        address executor;
        SwapData swapData;
        uint256 partnerAndFee;
        bytes executorData;
    }
}
