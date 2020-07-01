// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

/// @dev Minimal interface for our interactions with UniswapFactory
interface IUniswapFactory {
    function getExchange(address token) external view returns (address exchange);
}
