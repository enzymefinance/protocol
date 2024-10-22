    // SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IUniswapV2Pair} from "tests/interfaces/external/IUniswapV2Pair.sol";

address constant ETHEREUM_UNISWAP_V2_POOL_WETH_USDC = 0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc;
address constant ETHEREUM_UNISWAP_V2_FACTORY = 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f;
address constant ETHEREUM_UNISWAP_V2_ROUTER = 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;

address constant POLYGON_UNISWAP_V2_POOL_WMATIC_USDT = 0x93CA061a80bFb622E7B529F6de1fDe4A9129CF8E;
address constant POLYGON_UNISWAP_V2_FACTORY = 0x9e5A52f57b3038F1B8EeE45F28b3C1967e22799C;
address constant POLYGON_UNISWAP_V2_ROUTER = 0xedf6066a2b290C185783862C7F4776A2C8077AD1;

address constant ARBITRUM_UNISWAP_V2_POOL_WETH_USDC = 0xF64Dfe17C8b87F012FCf50FbDA1D62bfA148366a;
address constant ARBITRUM_UNISWAP_V2_FACTORY = 0xf1D7CC64Fb4452F05c498126312eBE29f30Fbcf9;
address constant ARBITRUM_UNISWAP_V2_ROUTER = 0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24;

abstract contract UniswapV2Utils {
    function getExpectedUnderlyingTokenAmounts(address _poolTokenAddress, uint256 _redeemPoolTokenAmount)
        internal
        view
        returns (uint256 expectedToken0Amount_, uint256 expectedToken1Amount_)
    {
        uint256 poolTokensSupply = IUniswapV2Pair(_poolTokenAddress).totalSupply();
        IERC20 token0 = IERC20(IUniswapV2Pair(_poolTokenAddress).token0());
        IERC20 token1 = IERC20(IUniswapV2Pair(_poolTokenAddress).token1());
        uint256 poolToken0Balance = token0.balanceOf(_poolTokenAddress);
        uint256 poolToken1Balance = token1.balanceOf(_poolTokenAddress);

        expectedToken0Amount_ = _redeemPoolTokenAmount * poolToken0Balance / poolTokensSupply;
        expectedToken1Amount_ = _redeemPoolTokenAmount * poolToken1Balance / poolTokensSupply;

        return (expectedToken0Amount_, expectedToken1Amount_);
    }
}
