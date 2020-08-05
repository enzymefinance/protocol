// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.8;

/// @dev Minimal interface for our interactions with Uniswap V2's Router2
interface IUniswapV2Router2 {
    function swapExactTokensForTokens(uint256, uint256, address[] calldata, address, uint256)
        external
        returns (uint256[] memory);

    // Used for testing only
    function getAmountsOut(uint256, address[] calldata) external view returns (uint256[] memory);
}
