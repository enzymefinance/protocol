// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.
    (c) Enzyme Council <council@enzyme.finance>
    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title ITestUniswapV2Router Interface
/// @author Enzyme Council <security@enzyme.finance>
interface ITestUniswapV2Router {
    function getAmountsOut(uint256 _amountIn, address[] memory _path)
        external
        view
        returns (uint256[] memory amounts_);

    function quote(
        uint256 _amountA,
        uint256 _reserveA,
        uint256 _reserveB
    ) external pure returns (uint256 quote_);

    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint256 _amountIn,
        uint256 _amountOutMin,
        address[] calldata _path,
        address _to,
        uint256 _deadline
    ) external;
}
