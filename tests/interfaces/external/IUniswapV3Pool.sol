// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.6.0 <0.9.0;

interface IUniswapV3Pool {
    function fee() external view returns (uint24 fee_);
}
