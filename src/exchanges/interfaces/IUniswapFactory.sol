pragma solidity 0.6.1;

/// @dev Minimal interface for our interactions with UniswapFactory
interface IUniswapFactory {
    function getExchange(address token) external view returns (address exchange);
}
