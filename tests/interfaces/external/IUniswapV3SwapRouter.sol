// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.6.0 <0.9.0;
pragma experimental ABIEncoderV2;

interface IUniswapV3SwapRouter {
    struct ExactInputParams {
        bytes path;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }

    function exactInput(ExactInputParams calldata _exactInputParams) external payable returns (uint256 amountOut_);
}
