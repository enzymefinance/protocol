// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

/// @title IUniswapV2Pair Interface
/// @author Melon Council DAO <security@meloncoucil.io>
/// @notice Minimal interface for our interactions with the Uniswap V2's Pair contract
interface IUniswapV2Pair {
    function getReserves()
        external
        view
        returns (
            uint112,
            uint112,
            uint32
        );

    function token0() external view returns (address);

    function token1() external view returns (address);

    function totalSupply() external view returns (uint256);
}
