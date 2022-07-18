// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the Enzyme Protocol.

    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title ITestUniswapV2Pair Interface
/// @author Enzyme Council <security@enzyme.finance>
interface ITestUniswapV2Pair {
    function getReserves()
        external
        view
        returns (
            uint112 reserve0_,
            uint112 reserve1_,
            uint32 blockTimestampLast_
        );

    function kLast() external view returns (uint256 kLast_);

    function token0() external view returns (address token0_);

    function token1() external view returns (address token1_);

    function totalSupply() external view returns (uint256 supply_);
}
