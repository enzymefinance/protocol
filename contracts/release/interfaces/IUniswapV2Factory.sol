// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.6.12;

/// @title IUniswapV2Factory Interface
/// @author Enzyme Council <security@enzyme.finance>
/// @notice Minimal interface for our interactions with the Uniswap V2's Factory contract
interface IUniswapV2Factory {
    function feeTo() external view returns (address);

    function getPair(address, address) external view returns (address);
}
