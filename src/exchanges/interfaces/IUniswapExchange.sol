pragma solidity 0.6.1;

/// @dev Minimal interface for our interactions with UniswapExchange
interface IUniswapExchange {
    // Trade ETH to ERC20
    function ethToTokenTransferInput(uint256 min_tokens, uint256 deadline, address recipient)
        external
        payable
        returns (uint256 tokens_bought);
    // Trade ERC20 to ETH
    function tokenToEthSwapInput(uint256 tokens_sold, uint256 min_eth, uint256 deadline)
        external
        returns (uint256 eth_bought);
    // Trade ERC20 to ERC20
    function tokenToTokenTransferInput(
        uint256 tokens_sold,
        uint256 min_tokens_bought,
        uint256 min_eth_bought,
        uint256 deadline,
        address recipient,
        address token_addr
    )
        external
        returns (uint256 tokens_bought);

    /// @dev The following functions are only used in tests
    // Provide Liquidity
    function addLiquidity(uint256 min_liquidity, uint256 max_tokens, uint256 deadline)
        external
        payable
        returns (uint256);
    // Get Prices
    function getEthToTokenInputPrice(uint256 eth_sold)
        external
        view
        returns (uint256 tokens_bought);
    function getTokenToEthInputPrice(uint256 tokens_sold)
        external
        view
        returns (uint256 eth_bought);
}
