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
    uint256 internal constant ETHEREUM_BLOCK_LATEST = 17500000; // June 17th, 2023
    uint256 internal constant ETHEREUM_BLOCK_LATEST_TIME_SENSITIVE = 17345000; // May 26, 2023
    uint256 internal constant ETHEREUM_BLOCK_2023_01_13 = 16400000;

    uint256 internal constant POLYGON_BLOCK_LATEST = POLYGON_BLOCK_LATEST_TIME_SENSITIVE;
    uint256 internal constant POLYGON_BLOCK_LATEST_TIME_SENSITIVE = 43179000; // May 26, 2023

    // Network assets
    address internal constant ETHEREUM_BAL = 0xba100000625a3754423978a60c9317c58a424e3D;
    address internal constant ETHEREUM_DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
    address internal constant ETHEREUM_LINK = 0x514910771AF9Ca656af840dff83E8264EcF986CA;
    address internal constant ETHEREUM_MLN = 0xec67005c4E498Ec7f55E092bd1d35cbC47C91892;
    address internal constant ETHEREUM_STKAAVE = 0x4da27a545c0c5B758a6BA100e3a049001de870f5;
    address internal constant ETHEREUM_USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address internal constant ETHEREUM_USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;
    address internal constant ETHEREUM_WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address internal constant ETHEREUM_WBTC = 0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599;
    address internal constant ETHEREUM_WSTETH = 0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0;

    address internal constant POLYGON_DAI = 0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063;
    address internal constant POLYGON_LINK = 0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39;
    address internal constant POLYGON_MLN = 0xa9f37D84c856fDa3812ad0519Dad44FA0a3Fe207;
    address internal constant POLYGON_USDC = 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174;
    address internal constant POLYGON_USDT = 0xc2132D05D31c914a87C6611C10748AEb04B58e8F;
    address internal constant POLYGON_WBTC = 0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6;
    address internal constant POLYGON_WETH = 0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619;
    address internal constant POLYGON_WMATIC = 0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270;

    // Network Chainlink aggregators
    address internal constant ETHEREUM_BAL_ETH_AGGREGATOR = 0xC1438AA3823A6Ba0C159CfA8D98dF5A994bA120b;
    address internal constant ETHEREUM_ETH_USD_AGGREGATOR = 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419;
    address internal constant ETHEREUM_MLN_ETH_AGGREGATOR = 0xDaeA8386611A157B08829ED4997A8A62B557014C;
    address internal constant ETHEREUM_USDC_ETH_AGGREGATOR = 0x986b5E1e1755e3C2440e960477f25201B0a8bbD4;

    address internal constant POLYGON_ETH_USD_AGGREGATOR = 0xF9680D99D6C9589e2a93a78A04A279e509205945;
    address internal constant POLYGON_MATIC_USD_AGGREGATOR = 0xAB594600376Ec9fD91F8e885dADF0CE036862dE0;
    address internal constant POLYGON_MLN_ETH_AGGREGATOR = 0xB89D583B72aBF9C3a7e6e093251C2fCad3365312;
    address internal constant POLYGON_USDC_USD_AGGREGATOR = 0xfE4A8cc5b5B2366C1B58Bea3858e81843581b2F7;
    address internal constant POLYGON_WBTC_USD_AGGREGATOR = 0xDE31F8bFBD8c84b5360CFACCa3539B938dd78ae6;
}
