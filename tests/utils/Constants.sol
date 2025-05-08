// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

abstract contract Constants {
    // Time
    uint256 internal constant SECONDS_ONE_MINUTE = 60;
    uint256 internal constant SECONDS_ONE_HOUR = SECONDS_ONE_MINUTE * 60;
    uint256 internal constant SECONDS_ONE_DAY = SECONDS_ONE_HOUR * 24;
    uint256 internal constant SECONDS_ONE_YEAR = SECONDS_ONE_DAY * 36525 / 100;

    // Percentages
    uint256 internal constant BPS_ONE_HUNDRED_PERCENT = 10_000;
    uint256 internal constant BPS_ONE_PERCENT = BPS_ONE_HUNDRED_PERCENT / 100;

    uint256 internal constant WEI_ONE_HUNDRED_PERCENT = 10 ** 18;
    uint256 internal constant WEI_ONE_PERCENT = WEI_ONE_HUNDRED_PERCENT / 100;

    // Network ChainIDs
    uint256 internal constant ETHEREUM_CHAIN_ID = 1;
    uint256 internal constant POLYGON_CHAIN_ID = 137;
    uint256 internal constant ARBITRUM_CHAIN_ID = 42161;
    uint256 internal constant BASE_CHAIN_ID = 8453;

    // Miscellaneous
    uint8 internal constant CHAINLINK_AGGREGATOR_DECIMALS_ETH = 18;
    uint8 internal constant CHAINLINK_AGGREGATOR_DECIMALS_USD = 8;
    uint256 internal constant CHAINLINK_AGGREGATOR_PRECISION_ETH = 10 ** CHAINLINK_AGGREGATOR_DECIMALS_ETH;
    uint256 internal constant CHAINLINK_AGGREGATOR_PRECISION_USD = 10 ** CHAINLINK_AGGREGATOR_DECIMALS_USD;

    // Network blocks (for fork tests)
    // Some tests may require specific blocks to guarantee a required setup,
    // expected exchange rates, etc.
    // `ETHEREUM_BLOCK_LATEST` can be increased as-needed, and should be used in all tests
    // that should generally continue to pass regardless of block.
    uint256 internal constant ETHEREUM_BLOCK_TIME_SENSITIVE_STAKEWISE = 22400000; // May 3rd, 2025
    uint256 internal constant ETHEREUM_BLOCK_LATEST = 21710000; // Jan 26th, 2025
    uint256 internal constant ETHEREUM_BLOCK_TIME_SENSITIVE = 21710000; // Jan 26th, 2025
    uint256 internal constant ETHEREUM_BLOCK_TIME_SENSITIVE_MYSO_V3 = 21679809; // Jan 22nd, 2025
    uint256 internal constant ETHEREUM_BLOCK_TIME_SENSITIVE_PARASWAP_V6 = 21819120; // Feb 10th 2025
    uint256 internal constant ETHEREUM_BLOCK_TIME_SENSITIVE_ONE_INCH_V5 = 19518890; // March 26th, 2024
    uint256 internal constant ETHEREUM_BLOCK_TIME_SENSITIVE_PENDLE = 20100000; // June 15th, 2024
    uint256 internal constant ETHEREUM_BLOCK_TIME_SENSITIVE_TERM_FINANCE = 18554000; // Nov 12th, 2023
    uint256 internal constant ETHEREUM_BLOCK_TIME_SENSITIVE_THE_GRAPH = 20711624; // Sep 9th, 2024

    uint256 internal constant POLYGON_BLOCK_LATEST = 67047280; // Jan 23rd, 2025
    uint256 internal constant POLYGON_BLOCK_TIME_SENSITIVE = 54900000; // March 21st, 2024
    uint256 internal constant POLYGON_BLOCK_TIME_SENSITIVE_ONE_INCH_V5 = 55136740; // March 27th, 2024

    uint256 internal constant ARBITRUM_BLOCK_LATEST = 278101140; // Nov 25th, 2024
    uint256 internal constant ARBITRUM_BLOCK_TIME_SENSITIVE = 231099000; // July 11th, 2024

    uint256 internal constant BASE_BLOCK_LATEST = 27583610; // March 14th, 2025
    uint256 internal constant BASE_CHAIN_BLOCK_TIME_SENSITIVE_ONE_INCH_V5 = 23218719; // Dec 3rd, 2024

    // Network assets
    address internal constant NATIVE_ASSET_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    address internal constant ETHEREUM_AURA = 0xC0c293ce456fF0ED870ADd98a0828Dd4d2903DBF;
    address internal constant ETHEREUM_BAL = 0xba100000625a3754423978a60c9317c58a424e3D;
    address internal constant ETHEREUM_CBBTC = 0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf;
    address internal constant ETHEREUM_COMP = 0xc00e94Cb662C3520282E6f5717214004A7f26888;
    address internal constant ETHEREUM_COMPOUND_V2_CDAI = 0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643;
    address internal constant ETHEREUM_COMPOUND_V2_CETH = 0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5;
    address internal constant ETHEREUM_COMPOUND_V2_CUSDC = 0x39AA39c021dfbaE8faC545936693aC917d5E7563;
    address internal constant ETHEREUM_COMPOUND_V2_CWBTC = 0xC11b1268C1A384e55C48c2391d8d480264A3A7F4;
    address internal constant ETHEREUM_COMPOUND_V3_CUSDC = 0xc3d688B66703497DAA19211EEdff47f25384cdc3;
    address internal constant ETHEREUM_COMPOUND_V3_CWETH = 0xA17581A9E3356d9A858b789D68B4d866e593aE94;
    address internal constant ETHEREUM_CRV = 0xD533a949740bb3306d119CC777fa900bA034cd52;
    address internal constant ETHEREUM_CVX = 0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B;
    address internal constant ETHEREUM_DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
    address internal constant ETHEREUM_EBTC = 0x657e8C867D8B37dCC18fA4Caead9C45EB088C642;
    address internal constant ETHEREUM_EETH = 0x35fA164735182de50811E8e2E824cFb9B6118ac2;
    address internal constant ETHEREUM_ETHERFI_LIQUIDITY_POOL = 0x308861A430be4cce5502d0A12724771Fc6DaF216;
    address internal constant ETHEREUM_ETH_X = 0xA35b1B31Ce002FBF2058D22F30f95D405200A15b;
    address internal constant ETHEREUM_LBTC = 0x8236a87084f8B84306f72007F36F2618A5634494;
    address internal constant ETHEREUM_LDO = 0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32;
    address internal constant ETHEREUM_LINK = 0x514910771AF9Ca656af840dff83E8264EcF986CA;
    address internal constant ETHEREUM_LUSD = 0x5f98805A4E8be255a32880FDeC7F6728C6568bA0;
    address internal constant ETHEREUM_MBTC = 0x2F913C820ed3bEb3a67391a6eFF64E70c4B20b19;
    address internal constant ETHEREUM_MLN = 0xec67005c4E498Ec7f55E092bd1d35cbC47C91892;
    address internal constant ETHEREUM_PAXG = 0x45804880De22913dAFE09f4980848ECE6EcbAf78;
    address internal constant ETHEREUM_STETH = 0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84;
    address internal constant ETHEREUM_STKAAVE = 0x4da27a545c0c5B758a6BA100e3a049001de870f5;
    address internal constant ETHEREUM_USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address internal constant ETHEREUM_USDE = 0x4c9EDD5852cd905f086C759E8383e09bff1E68B3;
    address internal constant ETHEREUM_USDS = 0xdC035D45d973E3EC169d2276DDab16f1e407384F;
    address internal constant ETHEREUM_USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;
    address internal constant ETHEREUM_WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address internal constant ETHEREUM_WBTC = 0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599;
    address internal constant ETHEREUM_WSTETH = 0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0;

    address internal constant POLYGON_BAL = 0x9a71012B13CA4d3D0Cdc72A177DF3ef03b0E76A3;
    address internal constant POLYGON_COMPOUND_V3_CUSDC = 0xF25212E676D1F7F89Cd72fFEe66158f541246445;
    address internal constant POLYGON_CRV = 0x172370d5Cd63279eFa6d502DAB29171933a610AF;
    address internal constant POLYGON_DAI = 0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063;
    address internal constant POLYGON_MATIC_X = 0xfa68FB4628DFF1028CFEc22b4162FCcd0d45efb6;
    address internal constant POLYGON_LINK = 0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39;
    address internal constant POLYGON_MLN = 0xa9f37D84c856fDa3812ad0519Dad44FA0a3Fe207;
    address internal constant POLYGON_USDC = 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174;
    address internal constant POLYGON_USDT = 0xc2132D05D31c914a87C6611C10748AEb04B58e8F;
    address internal constant POLYGON_WBTC = 0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6;
    address internal constant POLYGON_WETH = 0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619;
    address internal constant POLYGON_WMATIC = 0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270;

    address internal constant ARBITRUM_BAL = 0x040d1EdC9569d4Bab2D15287Dc5A4F10F56a56B8;
    address internal constant ARBITRUM_CRV = 0x11cDb42B0EB46D95f990BeDD4695A6e3fA034978;
    address internal constant ARBITRUM_DAI = 0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1;
    address internal constant ARBITRUM_EETH = 0x35fA164735182de50811E8e2E824cFb9B6118ac2;
    address internal constant ARBITRUM_LINK = 0xf97f4df75117a78c1A5a0DBb814Af92458539FB4;
    address internal constant ARBITRUM_MLN = 0x8f5c1A99b1df736Ad685006Cb6ADCA7B7Ae4b514;
    address internal constant ARBITRUM_USDC = 0xaf88d065e77c8cC2239327C5EDb3A432268e5831;
    address internal constant ARBITRUM_USDT = 0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9;
    address internal constant ARBITRUM_WBTC = 0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f;
    address internal constant ARBITRUM_WETH = 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1;

    address internal constant BASE_CBETH = 0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22;
    address internal constant BASE_DAI = 0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb;
    address internal constant BASE_MLN = 0x7C298664BD6582f6f264c2Cb5a4B9cC09b6E3889;
    address internal constant BASE_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address internal constant BASE_WETH = 0x4200000000000000000000000000000000000006;
    address internal constant BASE_WSTETH = 0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452;

    // Network Chainlink aggregators
    address internal constant ETHEREUM_BAL_ETH_AGGREGATOR = 0xC1438AA3823A6Ba0C159CfA8D98dF5A994bA120b;
    address internal constant ETHEREUM_DAI_ETH_AGGREGATOR = 0x773616E4d11A78F511299002da57A0a94577F1f4;
    address internal constant ETHEREUM_ETH_USD_AGGREGATOR = 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419;
    address internal constant ETHEREUM_MLN_ETH_AGGREGATOR = 0xDaeA8386611A157B08829ED4997A8A62B557014C;
    address internal constant ETHEREUM_STETH_ETH_AGGREGATOR = 0x86392dC19c0b719886221c78AB11eb8Cf5c52812;
    address internal constant ETHEREUM_USDC_ETH_AGGREGATOR = 0x986b5E1e1755e3C2440e960477f25201B0a8bbD4;
    address internal constant ETHEREUM_USDT_ETH_AGGREGATOR = 0xEe9F2375b4bdF6387aa8265dD4FB8F16512A1d46;
    address internal constant ETHEREUM_WEETH_ETH_AGGREGATOR = 0x5c9C449BbC9a6075A2c061dF312a35fd1E05fF22;

    address internal constant POLYGON_ETH_USD_AGGREGATOR = 0xF9680D99D6C9589e2a93a78A04A279e509205945;
    address internal constant POLYGON_DAI_ETH_AGGREGATOR = 0xFC539A559e170f848323e19dfD66007520510085;
    address internal constant POLYGON_MATIC_USD_AGGREGATOR = 0xAB594600376Ec9fD91F8e885dADF0CE036862dE0;
    address internal constant POLYGON_MLN_ETH_AGGREGATOR = 0xB89D583B72aBF9C3a7e6e093251C2fCad3365312;
    address internal constant POLYGON_USDC_USD_AGGREGATOR = 0xfE4A8cc5b5B2366C1B58Bea3858e81843581b2F7;
    address internal constant POLYGON_USDT_ETH_AGGREGATOR = 0xf9d5AAC6E5572AEFa6bd64108ff86a222F69B64d;
    address internal constant POLYGON_WBTC_USD_AGGREGATOR = 0xDE31F8bFBD8c84b5360CFACCa3539B938dd78ae6;

    address internal constant ARBITRUM_ETH_USD_AGGREGATOR = 0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612;
    address internal constant ARBITRUM_BAL_USD_AGGREGATOR = 0xBE5eA816870D11239c543F84b71439511D70B94f;
    address internal constant ARBITRUM_CRV_USD_AGGREGATOR = 0xaebDA2c976cfd1eE1977Eac079B4382acb849325;
    address internal constant ARBITRUM_DAI_USD_AGGREGATOR = 0xc5C8E77B397E531B8EC06BFb0048328B30E9eCfB;
    // TODO: Replace with actual MLN/ETH aggregator.
    address internal constant ARBITRUM_MLN_ETH_AGGREGATOR = 0xb7c8Fb1dB45007F98A68Da0588e1AA524C317f27;
    address internal constant ARBITRUM_USDC_USD_AGGREGATOR = 0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3;
    address internal constant ARBITRUM_USDT_USD_AGGREGATOR = 0x3f3f5dF88dC9F13eac63DF89EC16ef6e7E25DdE7;

    address internal constant BASE_ETH_USD_AGGREGATOR = 0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70;
    address internal constant BASE_MLN_ETH_AGGREGATOR = 0x0000000000000000000000000000000000000000; // TODO: add this
    address internal constant BASE_USDC_USD_AGGREGATOR = 0x7e860098F58bBFC8648a4311b374B1D669a2bc6B;
    address internal constant BASE_WSTETH_ETH_AGGREGATOR = 0x43a5C292A453A3bF3606fa856197f09D7B74251a;

    // Network External contracts
    address internal constant ETHEREUM_MERKL_DISTRIBUTOR = 0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae;

    address internal constant POLYGON_MERKL_DISTRIBUTOR = ETHEREUM_MERKL_DISTRIBUTOR;

    address internal constant ARBITRUM_MERKL_DISTRIBUTOR = ETHEREUM_MERKL_DISTRIBUTOR;

    address internal constant BASE_MERKL_DISTRIBUTOR = ETHEREUM_MERKL_DISTRIBUTOR;
}
