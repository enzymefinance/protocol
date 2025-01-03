// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";
import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IUniswapV2Pair} from "tests/interfaces/external/IUniswapV2Pair.sol";
import {IFundDeployer} from "tests/interfaces/internal/IFundDeployer.sol";
import {IValueInterpreter} from "tests/interfaces/internal/IValueInterpreter.sol";
import {IUniswapV2PoolPriceFeed} from "tests/interfaces/internal/IUniswapV2PoolPriceFeed.sol";
import {
    ETHEREUM_UNISWAP_V2_POOL_WETH_USDC,
    ETHEREUM_UNISWAP_V2_FACTORY,
    ETHEREUM_UNISWAP_V2_ROUTER,
    POLYGON_UNISWAP_V2_POOL_WMATIC_USDT,
    POLYGON_UNISWAP_V2_FACTORY,
    POLYGON_UNISWAP_V2_ROUTER,
    ARBITRUM_UNISWAP_V2_POOL_WETH_USDC,
    ARBITRUM_UNISWAP_V2_FACTORY,
    ARBITRUM_UNISWAP_V2_ROUTER,
    UniswapV2Utils
} from "./UniswapV2Utils.sol";

abstract contract UniswapV2PoolPriceFeedTestBase is IntegrationTest, UniswapV2Utils {
    IUniswapV2Pair internal uniswapV2Pool;
    IUniswapV2PoolPriceFeed internal uniswapV2PoolPriceFeed;
    IERC20 internal token0;
    IERC20 internal token1;

    EnzymeVersion internal version;

    function __initialize(
        EnzymeVersion _version,
        uint256 _chainId,
        address _uniswapV2FactoryAddress,
        address _uniswapV2PoolAddress,
        uint256 _forkBlock
    ) internal {
        version = _version;

        setUpNetworkEnvironment({_chainId: _chainId, _forkBlock: _forkBlock});

        uniswapV2PoolPriceFeed = __deployPriceFeed({
            _fundDeployerAddress: getFundDeployerAddressForVersion({_version: version}),
            _valueInterpreterAddress: getValueInterpreterAddressForVersion({_version: version}),
            _uniswapV2FactoryAddress: _uniswapV2FactoryAddress
        });

        uniswapV2Pool = IUniswapV2Pair(_uniswapV2PoolAddress);
        token0 = IERC20(uniswapV2Pool.token0());
        token1 = IERC20(uniswapV2Pool.token1());

        // Add poolTokens to price feed
        vm.startPrank(IFundDeployer(getFundDeployerAddressForVersion({_version: version})).getOwner());
        uniswapV2PoolPriceFeed.addPoolTokens({_poolTokens: toArray(address(uniswapV2Pool))});

        // Register derivatives
        addDerivative({
            _valueInterpreter: IValueInterpreter(getValueInterpreterAddressForVersion({_version: _version})),
            _tokenAddress: address(uniswapV2Pool),
            _skipIfRegistered: true,
            _priceFeedAddress: address(uniswapV2PoolPriceFeed)
        });
        vm.stopPrank();
    }

    // DEPLOYMENT HELPERS

    function __deployPriceFeed(
        address _fundDeployerAddress,
        address _valueInterpreterAddress,
        address _uniswapV2FactoryAddress
    ) private returns (IUniswapV2PoolPriceFeed priceFeed_) {
        bytes memory args = abi.encode(_fundDeployerAddress, _valueInterpreterAddress, _uniswapV2FactoryAddress);
        address addr = deployCode("UniswapV2PoolPriceFeed.sol", args);
        return IUniswapV2PoolPriceFeed(addr);
    }

    function test_calcUnderlyingValues_success() public {
        uint256 derivativeAmount = assetUnit({_asset: IERC20(address(uniswapV2Pool))}) * 3;

        (uint256 expectedToken0Amount, uint256 expectedToken1Amount) = getExpectedUnderlyingTokenAmounts({
            _poolTokenAddress: address(uniswapV2Pool),
            _redeemPoolTokenAmount: derivativeAmount
        });

        (address[] memory underlyingAddresses, uint256[] memory underlyingValues) = uniswapV2PoolPriceFeed
            .calcUnderlyingValues({_derivative: address(uniswapV2Pool), _derivativeAmount: derivativeAmount});

        assertEq(
            toArray(address(token0), address(token1)),
            underlyingAddresses,
            "Mismatch between actual and expected underlying address"
        );
        // Small tolerance to account for slight differences between using the trusted rate and naively relying on the queried poolToken balances
        assertApproxEqRel(
            expectedToken0Amount,
            underlyingValues[0],
            2 * WEI_ONE_PERCENT / 1_000, // 0.002%
            "Mismatch between actual and expected underlying value"
        );
        assertApproxEqRel(
            expectedToken1Amount,
            underlyingValues[1],
            2 * WEI_ONE_PERCENT / 1_000, // 0.002%
            "Mismatch between actual and expected underlying value"
        );
    }

    function test_isSupportedAsset_success() public {
        assertTrue(uniswapV2PoolPriceFeed.isSupportedAsset({_asset: address(uniswapV2Pool)}), "Unsupported poolToken");
    }

    function test_isSupportedAsset_failsWithoutExpectedInterface() public {
        assertFalse(uniswapV2PoolPriceFeed.isSupportedAsset({_asset: address(token0)}), "Incorrectly supported token");
    }
}

contract EthereumWethUsdcTest is UniswapV2PoolPriceFeedTestBase {
    function setUp() public override {
        __initialize({
            _version: EnzymeVersion.Current,
            _chainId: ETHEREUM_CHAIN_ID,
            _uniswapV2FactoryAddress: ETHEREUM_UNISWAP_V2_FACTORY,
            _uniswapV2PoolAddress: ETHEREUM_UNISWAP_V2_POOL_WETH_USDC,
            _forkBlock: ETHEREUM_BLOCK_TIME_SENSITIVE
        });
    }
}

contract EthereumWethUsdcTestV4 is UniswapV2PoolPriceFeedTestBase {
    function setUp() public override {
        __initialize({
            _version: EnzymeVersion.V4,
            _chainId: ETHEREUM_CHAIN_ID,
            _uniswapV2FactoryAddress: ETHEREUM_UNISWAP_V2_FACTORY,
            _uniswapV2PoolAddress: ETHEREUM_UNISWAP_V2_POOL_WETH_USDC,
            _forkBlock: ETHEREUM_BLOCK_TIME_SENSITIVE
        });
    }
}

contract PolygonWmaticUsdcTest is UniswapV2PoolPriceFeedTestBase {
    function setUp() public override {
        __initialize({
            _version: EnzymeVersion.Current,
            _chainId: POLYGON_CHAIN_ID,
            _uniswapV2FactoryAddress: POLYGON_UNISWAP_V2_FACTORY,
            _uniswapV2PoolAddress: POLYGON_UNISWAP_V2_POOL_WMATIC_USDT,
            _forkBlock: POLYGON_BLOCK_TIME_SENSITIVE
        });
    }
}

contract PolygonWmaticUsdcTestV4 is UniswapV2PoolPriceFeedTestBase {
    function setUp() public override {
        __initialize({
            _version: EnzymeVersion.V4,
            _chainId: POLYGON_CHAIN_ID,
            _uniswapV2FactoryAddress: POLYGON_UNISWAP_V2_FACTORY,
            _uniswapV2PoolAddress: POLYGON_UNISWAP_V2_POOL_WMATIC_USDT,
            _forkBlock: POLYGON_BLOCK_TIME_SENSITIVE
        });
    }
}

contract ArbitrumWethUsdcTestV4 is UniswapV2PoolPriceFeedTestBase {
    function setUp() public override {
        __initialize({
            _version: EnzymeVersion.V4,
            _chainId: ARBITRUM_CHAIN_ID,
            _uniswapV2FactoryAddress: ARBITRUM_UNISWAP_V2_FACTORY,
            _uniswapV2PoolAddress: ARBITRUM_UNISWAP_V2_POOL_WETH_USDC,
            _forkBlock: ARBITRUM_BLOCK_LATEST
        });
    }
}

contract ArbitrumWethUsdcTest is UniswapV2PoolPriceFeedTestBase {
    function setUp() public override {
        __initialize({
            _version: EnzymeVersion.Current,
            _chainId: ARBITRUM_CHAIN_ID,
            _uniswapV2FactoryAddress: ARBITRUM_UNISWAP_V2_FACTORY,
            _uniswapV2PoolAddress: ARBITRUM_UNISWAP_V2_POOL_WETH_USDC,
            _forkBlock: ARBITRUM_BLOCK_LATEST
        });
    }
}
