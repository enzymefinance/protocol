// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

abstract contract Constants {
    // Time
    uint256 internal constant SECONDS_ONE_DAY = 60 * 60 * 24;

    // Percentages
    uint256 internal constant BPS_ONE_HUNDRED_PERCENT = 10_000;
    uint256 internal constant BPS_ONE_PERCENT = BPS_ONE_HUNDRED_PERCENT / 100;

    uint256 internal constant WEI_ONE_HUNDRED_PERCENT = 10 ** 18;
    uint256 internal constant WEI_ONE_PERCENT = WEI_ONE_HUNDRED_PERCENT / 100;

    // Network blocks (for fork tests)
    // Some tests may require specific blocks to guarantee a required setup,
    // expected exchange rates, etc.
    // `ETHEREUM_BLOCK_LATEST` can be increased as-needed, and should be used in all tests
    // that should generally continue to pass regardless of block.
    uint256 internal constant ETHEREUM_BLOCK_LATEST = 17345000; // May 26, 2023
    uint256 internal constant ETHEREUM_BLOCK_2023_01_13 = 16400000;

    uint256 internal constant POLYGON_BLOCK_LATEST = 43179000; // May 26, 2023

    // Network assets
    address internal constant ETHEREUM_DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
    address internal constant ETHEREUM_MLN = 0xec67005c4E498Ec7f55E092bd1d35cbC47C91892;
    address internal constant ETHEREUM_USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address internal constant ETHEREUM_WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

    address internal constant POLYGON_MLN = 0xa9f37D84c856fDa3812ad0519Dad44FA0a3Fe207;
    address internal constant POLYGON_WETH = 0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619;
    address internal constant POLYGON_WMATIC = 0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270;

    // Network config
    address internal constant ETHEREUM_ETH_USD_AGGREGATOR = 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419;

    address internal constant POLYGON_ETH_USD_AGGREGATOR = 0xF9680D99D6C9589e2a93a78A04A279e509205945;
}
