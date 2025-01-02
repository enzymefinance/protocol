// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IChainlinkPriceFeedMixin as IChainlinkPriceFeedMixinProd} from
    "contracts/release/infrastructure/price-feeds/primitives/IChainlinkPriceFeedMixin.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {ICurveLiquidityPool} from "tests/interfaces/external/ICurveLiquidityPool.sol";
import {IERC20} from "tests/interfaces/external/IERC20.sol";

import {ICurvePriceFeed} from "tests/interfaces/internal/ICurvePriceFeed.sol";
import {IFundDeployer} from "tests/interfaces/internal/IFundDeployer.sol";
import {IValueInterpreter} from "tests/interfaces/internal/IValueInterpreter.sol";

import {CurveUtils} from "./CurveUtils.sol";

abstract contract CurvePriceFeedTestBase is CurveUtils, IntegrationTest {
    event CurvePoolOwnerSet(address poolOwner);

    event DerivativeAdded(address indexed derivative, address indexed pool);

    event DerivativeRemoved(address indexed derivative);

    event InvariantProxyAssetForPoolSet(address indexed pool, address indexed invariantProxyAsset);

    event PoolRemoved(address indexed pool);

    event ValidatedVirtualPriceForPoolUpdated(address indexed pool, uint256 virtualPrice);

    ICurvePriceFeed internal priceFeed;
    address internal addressProvider;
    address internal poolOwner;

    EnzymeVersion internal version;

    function __initialize(
        EnzymeVersion _version,
        uint256 _chainId,
        address _addressProviderAddress,
        address _poolOwnerAddress
    ) internal {
        setUpNetworkEnvironment(_chainId);
        version = _version;
        priceFeed = deployPriceFeed({
            _fundDeployer: IFundDeployer(getFundDeployerAddressForVersion(version)),
            _addressProviderAddress: _addressProviderAddress,
            _poolOwnerAddress: _poolOwnerAddress,
            _virtualPriceDeviationThreshold: BPS_ONE_PERCENT
        });
    }

    // TEST HELPERS

    function __prankFundDeployerOwner() internal {
        vm.prank(IFundDeployer(getFundDeployerAddressForVersion({_version: version})).getOwner());
    }

    // TESTS

    function __test_calcUnderlyingValues_success(
        address _pool,
        address _invariantProxyAsset,
        address _lpToken,
        address _gaugeToken,
        uint256 _allowedDeviationPer365DaysInBps,
        uint256 _poolCreationTimestamp
    ) internal {
        __prankFundDeployerOwner();
        priceFeed.addPools({
            _pools: toArray(_pool),
            _invariantProxyAssets: toArray(_invariantProxyAsset),
            _reentrantVirtualPrices: toArray(true),
            _lpTokens: toArray(_lpToken),
            _gaugeTokens: toArray(_gaugeToken)
        });

        addDerivative({
            _valueInterpreter: IValueInterpreter(getValueInterpreterAddressForVersion(version)),
            _tokenAddress: _lpToken,
            _skipIfRegistered: false,
            _priceFeedAddress: address(priceFeed)
        });

        uint256 lpTokenValue = IValueInterpreter(getValueInterpreterAddressForVersion(version)).calcCanonicalAssetValue({
            _baseAsset: _lpToken,
            _amount: assetUnit(IERC20(_lpToken)),
            _quoteAsset: address(wethToken)
        });

        if (_gaugeToken != address(0)) {
            addDerivative({
                _valueInterpreter: IValueInterpreter(getValueInterpreterAddressForVersion(version)),
                _tokenAddress: _gaugeToken,
                _skipIfRegistered: false,
                _priceFeedAddress: address(priceFeed)
            });

            uint256 gaugeTokenValue = IValueInterpreter(getValueInterpreterAddressForVersion(version))
                .calcCanonicalAssetValue({
                _baseAsset: _gaugeToken,
                _amount: assetUnit(IERC20(_gaugeToken)),
                _quoteAsset: address(wethToken)
            });

            assertEq(lpTokenValue, gaugeTokenValue, "LP token and gauge token values don't match");
        }

        uint256 invariantProxyAssetValue = IValueInterpreter(getValueInterpreterAddressForVersion(version))
            .calcCanonicalAssetValue({
            _baseAsset: _invariantProxyAsset,
            _amount: assetUnit(IERC20(_invariantProxyAsset)),
            _quoteAsset: address(wethToken)
        });

        uint256 timePassed = block.timestamp - _poolCreationTimestamp;

        assertGe(lpTokenValue, invariantProxyAssetValue, "LP token value is less than invariant proxy asset value");
        assertLe(
            lpTokenValue,
            invariantProxyAssetValue
                + (invariantProxyAssetValue * _allowedDeviationPer365DaysInBps * timePassed)
                    / (365 days * BPS_ONE_HUNDRED_PERCENT),
            "LP token value is more than invariant proxy asset value"
        );
    }

    function test_calcUnderlyingValues_failsUnsupportedDerivative() public {
        vm.expectRevert("calcUnderlyingValues: _derivative is not supported");
        priceFeed.calcUnderlyingValues({_derivative: makeAddr("fake token"), _derivativeAmount: 1});
    }

    function __test_addPools_success(
        address[] memory _pools,
        bool[] memory _reentrantVirtualPrices,
        address[] memory _lpTokens,
        address[] memory _gaugeTokens,
        bool _validatePools
    ) internal {
        for (uint256 i = 0; i < _pools.length; i++) {
            assertFalse(priceFeed.isSupportedAsset(_pools[i]), "Supported pool");
            assertFalse(priceFeed.isSupportedAsset(_gaugeTokens[i]), "Supported gauge");
        }

        address[] memory invariantProxyAssets = new address[](_pools.length);
        for (uint256 i = 0; i < _pools.length; i++) {
            invariantProxyAssets[i] = address(createTestToken());
        }

        __prankFundDeployerOwner();

        for (uint256 i = 0; i < _pools.length; i++) {
            if (_reentrantVirtualPrices[i]) {
                vm.expectEmit({
                    checkTopic1: true,
                    checkTopic2: true,
                    checkTopic3: true,
                    checkData: false, // don't check the lastValidatedVirtualPrice, as we don't know it upfront
                    emitter: address(priceFeed)
                });
                emit ValidatedVirtualPriceForPoolUpdated(_pools[i], 0);
            }

            expectEmit(address(priceFeed));
            emit InvariantProxyAssetForPoolSet(_pools[i], invariantProxyAssets[i]);

            expectEmit(address(priceFeed));
            emit DerivativeAdded(_lpTokens[i], _pools[i]);

            if (_gaugeTokens[i] != address(0)) {
                expectEmit(address(priceFeed));
                emit DerivativeAdded(_gaugeTokens[i], _pools[i]);
            }
        }

        if (_validatePools) {
            priceFeed.addPools({
                _pools: _pools,
                _invariantProxyAssets: invariantProxyAssets,
                _reentrantVirtualPrices: _reentrantVirtualPrices,
                _lpTokens: _lpTokens,
                _gaugeTokens: _gaugeTokens
            });
        } else {
            priceFeed.addPoolsWithoutValidation({
                _pools: _pools,
                _invariantProxyAssets: invariantProxyAssets,
                _reentrantVirtualPrices: _reentrantVirtualPrices,
                _lpTokens: _lpTokens,
                _gaugeTokens: _gaugeTokens
            });
        }

        for (uint256 i = 0; i < _pools.length; i++) {
            assertTrue(priceFeed.isSupportedAsset(_lpTokens[i]), "Unsupported lp token");
            if (_gaugeTokens[i] != address(0)) {
                assertTrue(priceFeed.isSupportedAsset(_gaugeTokens[i]), "Unsupported gauge");
            }
        }
    }

    function test_addPools_failsUnequalArrays() public {
        __prankFundDeployerOwner();
        vm.expectRevert("__addPools: Unequal arrays");
        priceFeed.addPoolsWithoutValidation({
            _pools: toArray(makeAddr("pool")),
            _invariantProxyAssets: new address[](0),
            _reentrantVirtualPrices: new bool[](0),
            _lpTokens: new address[](0),
            _gaugeTokens: new address[](0)
        });
    }

    function test_addPools_failsEmptyLpToken() public {
        __prankFundDeployerOwner();
        vm.expectRevert("__addPools: Empty lpToken");
        priceFeed.addPoolsWithoutValidation({
            _pools: toArray(makeAddr("pool")),
            _invariantProxyAssets: toArray(makeAddr("invariantProxyAsset")),
            _reentrantVirtualPrices: toArray(true),
            _lpTokens: toArray(address(0)),
            _gaugeTokens: toArray(makeAddr("gaugeToken"))
        });
    }

    function test_addPools_failsAlreadyRegistered() public {
        address fakePool = makeAddr("fake pool");

        vm.mockCall({
            callee: fakePool,
            data: abi.encodeWithSelector(ICurveLiquidityPool.get_virtual_price.selector),
            returnData: abi.encode(1)
        });

        address fakeLpToken = address(createTestToken("fake lp token"));
        address fakeInvariantProxy = address(createTestToken("fake invariant proxy"));

        __prankFundDeployerOwner();
        priceFeed.addPoolsWithoutValidation({
            _pools: toArray(fakePool),
            _invariantProxyAssets: toArray(fakeInvariantProxy),
            _reentrantVirtualPrices: toArray(false),
            _lpTokens: toArray(fakeLpToken),
            _gaugeTokens: toArray(address(0))
        });

        __prankFundDeployerOwner();
        vm.expectRevert("__addPools: Already registered");
        priceFeed.addPoolsWithoutValidation({
            _pools: toArray(fakePool),
            _invariantProxyAssets: toArray(fakeInvariantProxy),
            _reentrantVirtualPrices: toArray(false),
            _lpTokens: toArray(fakeLpToken),
            _gaugeTokens: toArray(address(0))
        });
    }

    function test_addDerivative_failsNot18Decimal() public {
        address fakePool = makeAddr("fake pool");

        vm.mockCall({
            callee: fakePool,
            data: abi.encodeWithSelector(ICurveLiquidityPool.get_virtual_price.selector),
            returnData: abi.encode(1)
        });

        address fakeLpToken = address(createTestToken(17));
        address fakeInvariantProxy = address(createTestToken("fake invariant proxy"));

        __prankFundDeployerOwner();
        vm.expectRevert("__addDerivative: Not 18-decimal");
        priceFeed.addPoolsWithoutValidation({
            _pools: toArray(fakePool),
            _invariantProxyAssets: toArray(fakeInvariantProxy),
            _reentrantVirtualPrices: toArray(false),
            _lpTokens: toArray(fakeLpToken),
            _gaugeTokens: toArray(address(0))
        });
    }

    function __test_addGaugeTokens_success(address[] memory _pools, address[] memory _gaugeTokens, bool _validatePools)
        internal
    {
        for (uint256 i = 0; i < _pools.length; i++) {
            assertFalse(priceFeed.isSupportedAsset(_gaugeTokens[i]), "Supported gauge");
        }

        address[] memory invariantProxyAssets = new address[](_pools.length);
        bool[] memory reentrantVirtualPrices = new bool[](_pools.length);
        address[] memory lpTokens = new address[](_pools.length);
        address[] memory zeroAddressGaugeTokens = new address[](_pools.length);
        for (uint256 i = 0; i < _pools.length; i++) {
            invariantProxyAssets[i] = address(createTestToken());
            reentrantVirtualPrices[i] = false;
            lpTokens[i] = address(createTestToken());
            zeroAddressGaugeTokens[i] = address(0);
        }

        __prankFundDeployerOwner();
        priceFeed.addPoolsWithoutValidation({
            _pools: _pools,
            _invariantProxyAssets: invariantProxyAssets,
            _reentrantVirtualPrices: reentrantVirtualPrices,
            _lpTokens: lpTokens,
            _gaugeTokens: zeroAddressGaugeTokens
        });

        __prankFundDeployerOwner();

        for (uint256 i = 0; i < _gaugeTokens.length; i++) {
            expectEmit(address(priceFeed));
            emit DerivativeAdded(_gaugeTokens[i], _pools[i]);
        }

        if (_validatePools) {
            priceFeed.addGaugeTokens({_pools: _pools, _gaugeTokens: _gaugeTokens});
        } else {
            priceFeed.addGaugeTokensWithoutValidation({_pools: _pools, _gaugeTokens: _gaugeTokens});
        }

        for (uint256 i = 0; i < _pools.length; i++) {
            assertTrue(priceFeed.isSupportedAsset(_gaugeTokens[i]), "Unsupported gauge");
        }
    }

    function test_addGaugeTokensPoolNotRegistered_failure() public {
        __prankFundDeployerOwner();
        vm.expectRevert("__addGaugeTokens: Pool not registered");
        priceFeed.addGaugeTokensWithoutValidation({
            _pools: toArray(makeAddr("pool")),
            _gaugeTokens: toArray(makeAddr("gauge"))
        });
    }

    function test_setCurvePoolOwner_success() public {
        address newPoolOwner = makeAddr("new pool owner");

        __prankFundDeployerOwner();

        expectEmit(address(priceFeed));
        emit CurvePoolOwnerSet(newPoolOwner);

        priceFeed.setCurvePoolOwner(newPoolOwner);

        assertEq(newPoolOwner, priceFeed.getCurvePoolOwner(), "Incorrect pool owner");
    }

    function test_removePools_success() public {
        address fakePool = makeAddr("fake pool");

        vm.mockCall({
            callee: fakePool,
            data: abi.encodeWithSelector(ICurveLiquidityPool.get_virtual_price.selector),
            returnData: abi.encode(1)
        });

        address fakeLpToken = address(createTestToken("fake lp token"));
        address fakeInvariantProxy = address(createTestToken("fake invariant proxy"));

        __prankFundDeployerOwner();
        priceFeed.addPoolsWithoutValidation({
            _pools: toArray(fakePool),
            _invariantProxyAssets: toArray(fakeInvariantProxy),
            _reentrantVirtualPrices: toArray(false),
            _lpTokens: toArray(fakeLpToken),
            _gaugeTokens: toArray(address(0))
        });

        __prankFundDeployerOwner();

        expectEmit(address(priceFeed));
        emit PoolRemoved(fakePool);
        priceFeed.removePools(toArray(fakePool));

        assertEq(priceFeed.getLpTokenForPool(fakePool), address(0), "Pool lp token not removed");
        assertEq(priceFeed.getPoolInfo(fakePool).invariantProxyAsset, address(0), "Pool info not removed");
    }

    function test_removeDerivatives_success() public {
        address fakePool = makeAddr("fake pool");

        vm.mockCall({
            callee: fakePool,
            data: abi.encodeWithSelector(ICurveLiquidityPool.get_virtual_price.selector),
            returnData: abi.encode(1)
        });

        address fakeLpToken = address(createTestToken("fake lp token"));
        address fakeInvariantProxy = address(createTestToken("fake invariant proxy"));

        __prankFundDeployerOwner();
        priceFeed.addPoolsWithoutValidation({
            _pools: toArray(fakePool),
            _invariantProxyAssets: toArray(fakeInvariantProxy),
            _reentrantVirtualPrices: toArray(false),
            _lpTokens: toArray(fakeLpToken),
            _gaugeTokens: toArray(address(0))
        });

        __prankFundDeployerOwner();

        expectEmit(address(priceFeed));
        emit DerivativeRemoved(fakeLpToken);
        priceFeed.removeDerivatives(toArray(fakeLpToken));

        assertEq(priceFeed.getPoolForDerivative(fakeLpToken), address(0), "Lp token not removed");
    }

    function test_updatePoolInfo_success() public {
        address fakePool = makeAddr("fake pool");

        vm.mockCall({
            callee: fakePool,
            data: abi.encodeWithSelector(ICurveLiquidityPool.get_virtual_price.selector),
            returnData: abi.encode(1)
        });

        address fakeLpToken = address(createTestToken("fake lp token"));
        address fakeInvariantProxy = address(createTestToken("fake invariant proxy"));

        __prankFundDeployerOwner();
        priceFeed.addPoolsWithoutValidation({
            _pools: toArray(fakePool),
            _invariantProxyAssets: toArray(fakeInvariantProxy),
            _reentrantVirtualPrices: toArray(false),
            _lpTokens: toArray(fakeLpToken),
            _gaugeTokens: toArray(address(0))
        });

        address newFakeInvariantProxy = address(createTestToken("new fake invariant proxy"));
        uint256 newVirtualPrice = 123;

        vm.mockCall({
            callee: fakePool,
            data: abi.encodeWithSelector(ICurveLiquidityPool.get_virtual_price.selector),
            returnData: abi.encode(newVirtualPrice)
        });

        __prankFundDeployerOwner();

        expectEmit(address(priceFeed));
        emit ValidatedVirtualPriceForPoolUpdated(fakePool, newVirtualPrice);

        expectEmit(address(priceFeed));
        emit InvariantProxyAssetForPoolSet(fakePool, newFakeInvariantProxy);

        priceFeed.updatePoolInfo({
            _pools: toArray(fakePool),
            _invariantProxyAssets: toArray(newFakeInvariantProxy),
            _reentrantVirtualPrices: toArray(true)
        });

        assertEq(
            priceFeed.getPoolInfo(fakePool).invariantProxyAsset, newFakeInvariantProxy, "Incorrect invariant proxy"
        );
        assertEq(priceFeed.getPoolInfo(fakePool).lastValidatedVirtualPrice, newVirtualPrice, "Incorrect virtual price");
    }

    function test_updatePoolInfoUnequalArrays_failure() public {
        __prankFundDeployerOwner();
        vm.expectRevert("updatePoolInfo: Unequal arrays");
        priceFeed.updatePoolInfo({
            _pools: toArray(makeAddr("pool")),
            _invariantProxyAssets: new address[](0),
            _reentrantVirtualPrices: new bool[](0)
        });
    }
}

abstract contract CurvePriceFeedTestEthereumBase is CurvePriceFeedTestBase {
    function __initialize(EnzymeVersion _version) internal {
        __initialize({
            _version: _version,
            _chainId: ETHEREUM_CHAIN_ID,
            _addressProviderAddress: ADDRESS_PROVIDER_ADDRESS,
            _poolOwnerAddress: ETHEREUM_POOL_OWNER_ADDRESS
        });
    }

    function test_calcUnderlyingValues_successStEthPool() public {
        __test_calcUnderlyingValues_success({
            _pool: ETHEREUM_STETH_NG_POOL_ADDRESS,
            _invariantProxyAsset: address(wethToken),
            _lpToken: ETHEREUM_STETH_NG_POOL_LP_TOKEN_ADDRESS,
            _gaugeToken: ETHEREUM_STETH_NG_POOL_GAUGE_TOKEN_ADDRESS,
            _poolCreationTimestamp: 1684243259,
            _allowedDeviationPer365DaysInBps: 4 * BPS_ONE_PERCENT
        });
    }

    function test_calcUnderlyingValues_successAaveUSDPool() public {
        __test_calcUnderlyingValues_success({
            _pool: ETHEREUM_AAVE_POOL_ADDRESS,
            _invariantProxyAsset: getUsdEthSimulatedAggregatorForVersion(version),
            _lpToken: ETHEREUM_AAVE_POOL_LP_TOKEN_ADDRESS,
            _gaugeToken: ETHEREUM_AAVE_POOL_GAUGE_TOKEN_ADDRESS,
            _allowedDeviationPer365DaysInBps: 15 * BPS_ONE_PERCENT,
            _poolCreationTimestamp: 1608558210
        });
    }

    function test_addPools_success() public {
        __test_addPools_success({
            _pools: toArray(
                ETHEREUM_AAVE_POOL_ADDRESS,
                ETHEREUM_STETH_NG_POOL_ADDRESS,
                ETHEREUM_META_POOL_ADDRESS,
                ETHEREUM_BASE_POOL_ADDRESS
            ),
            _reentrantVirtualPrices: toArray(true, false, true, false),
            _lpTokens: toArray(
                ETHEREUM_AAVE_POOL_LP_TOKEN_ADDRESS,
                ETHEREUM_STETH_NG_POOL_LP_TOKEN_ADDRESS,
                ETHEREUM_META_POOL_LP_TOKEN_ADDRESS,
                ETHEREUM_BASE_POOL_LP_TOKEN_ADDRESS
            ),
            _gaugeTokens: toArray(
                ETHEREUM_AAVE_POOL_GAUGE_TOKEN_ADDRESS,
                ETHEREUM_STETH_NG_POOL_GAUGE_TOKEN_ADDRESS,
                ETHEREUM_META_POOL_GAUGE_TOKEN_ADDRESS,
                ETHEREUM_BASE_POOL_GAUGE_TOKEN_ADDRESS
            ),
            _validatePools: true
        });
    }

    function test_addPoolsNoGauges_success() public {
        __test_addPools_success({
            _pools: toArray(
                ETHEREUM_AAVE_POOL_ADDRESS,
                ETHEREUM_STETH_NG_POOL_ADDRESS,
                ETHEREUM_META_POOL_ADDRESS,
                ETHEREUM_BASE_POOL_ADDRESS
            ),
            _reentrantVirtualPrices: toArray(true, true, true, false),
            _lpTokens: toArray(
                ETHEREUM_AAVE_POOL_LP_TOKEN_ADDRESS,
                ETHEREUM_STETH_NG_POOL_LP_TOKEN_ADDRESS,
                ETHEREUM_META_POOL_LP_TOKEN_ADDRESS,
                ETHEREUM_BASE_POOL_LP_TOKEN_ADDRESS
            ),
            _gaugeTokens: toArray(address(0), address(0), address(0), address(0)),
            _validatePools: true
        });
    }

    function test_addPoolsWithoutValidation_success() public {
        __test_addPools_success({
            _pools: toArray(
                ETHEREUM_AAVE_POOL_ADDRESS,
                ETHEREUM_STETH_NG_POOL_ADDRESS,
                ETHEREUM_META_POOL_ADDRESS,
                ETHEREUM_BASE_POOL_ADDRESS
            ),
            _reentrantVirtualPrices: toArray(true, true, true, false),
            _lpTokens: toArray(
                address(createTestToken()),
                ETHEREUM_BASE_POOL_GAUGE_TOKEN_ADDRESS,
                ETHEREUM_META_POOL_LP_TOKEN_ADDRESS,
                ETHEREUM_BASE_POOL_LP_TOKEN_ADDRESS
            ),
            _gaugeTokens: toArray(
                ETHEREUM_STETH_NG_POOL_GAUGE_TOKEN_ADDRESS,
                address(createTestToken()),
                address(createTestToken()),
                ETHEREUM_AAVE_POOL_LP_TOKEN_ADDRESS
            ),
            _validatePools: false
        });
    }

    function test_addGaugeTokens_success() public {
        __test_addGaugeTokens_success({
            _pools: toArray(
                ETHEREUM_AAVE_POOL_ADDRESS,
                ETHEREUM_STETH_NG_POOL_ADDRESS,
                ETHEREUM_META_POOL_ADDRESS,
                ETHEREUM_BASE_POOL_ADDRESS
            ),
            _gaugeTokens: toArray(
                ETHEREUM_AAVE_POOL_GAUGE_TOKEN_ADDRESS,
                ETHEREUM_STETH_NG_POOL_GAUGE_TOKEN_ADDRESS,
                ETHEREUM_META_POOL_GAUGE_TOKEN_ADDRESS,
                ETHEREUM_BASE_POOL_GAUGE_TOKEN_ADDRESS
            ),
            _validatePools: true
        });
    }

    function test_addGaugeTokensWithoutValidation_success() public {
        __test_addGaugeTokens_success({
            _pools: toArray(
                ETHEREUM_AAVE_POOL_ADDRESS,
                ETHEREUM_STETH_NG_POOL_ADDRESS,
                ETHEREUM_META_POOL_ADDRESS,
                ETHEREUM_BASE_POOL_ADDRESS
            ),
            _gaugeTokens: toArray(
                ETHEREUM_STETH_NG_POOL_GAUGE_TOKEN_ADDRESS,
                ETHEREUM_AAVE_POOL_GAUGE_TOKEN_ADDRESS,
                address(createTestToken()),
                address(createTestToken())
            ),
            _validatePools: false
        });
    }
}

abstract contract CurvePriceFeedTestPolygonBase is CurvePriceFeedTestBase {
    function __initialize(EnzymeVersion _version) internal {
        __initialize({
            _version: _version,
            _chainId: POLYGON_CHAIN_ID,
            _addressProviderAddress: ADDRESS_PROVIDER_ADDRESS,
            _poolOwnerAddress: POLYGON_POOL_OWNER_ADDRESS
        });
    }

    function test_calcUnderlyingValues_successAaveUSDPool() public {
        __test_calcUnderlyingValues_success({
            _pool: POLYGON_AAVE_POOL_ADDRESS,
            _invariantProxyAsset: getUsdEthSimulatedAggregatorForVersion(version),
            _lpToken: POLYGON_AAVE_POOL_LP_TOKEN_ADDRESS,
            _gaugeToken: POLYGON_AAVE_POOL_GAUGE_TOKEN_ADDRESS,
            _poolCreationTimestamp: 1618858763,
            _allowedDeviationPer365DaysInBps: 5 * BPS_ONE_PERCENT
        });
    }

    function test_addPools_success() public {
        __test_addPools_success({
            _pools: toArray(POLYGON_AAVE_POOL_ADDRESS, POLYGON_META_POOL_ADDRESS),
            _reentrantVirtualPrices: toArray(true, false),
            _lpTokens: toArray(POLYGON_AAVE_POOL_LP_TOKEN_ADDRESS, POLYGON_META_POOL_LP_TOKEN_ADDRESS),
            _gaugeTokens: toArray(POLYGON_AAVE_POOL_GAUGE_TOKEN_ADDRESS, address(0)),
            _validatePools: true
        });
    }

    function test_addPoolsNoGauges_success() public {
        __test_addPools_success({
            _pools: toArray(POLYGON_AAVE_POOL_ADDRESS, POLYGON_META_POOL_ADDRESS),
            _reentrantVirtualPrices: toArray(false, true),
            _lpTokens: toArray(POLYGON_AAVE_POOL_LP_TOKEN_ADDRESS, POLYGON_META_POOL_LP_TOKEN_ADDRESS),
            _gaugeTokens: toArray(address(0), address(0)),
            _validatePools: true
        });
    }

    function test_addPoolsWithoutValidation_success() public {
        __test_addPools_success({
            _pools: toArray(POLYGON_AAVE_POOL_ADDRESS, POLYGON_META_POOL_ADDRESS),
            _reentrantVirtualPrices: toArray(true, true),
            _lpTokens: toArray(address(createTestToken()), POLYGON_AAVE_POOL_LP_TOKEN_ADDRESS),
            _gaugeTokens: toArray(address(createTestToken()), address(createTestToken())),
            _validatePools: false
        });
    }

    function test_addGaugeTokens_success() public {
        __test_addGaugeTokens_success({
            _pools: toArray(POLYGON_AAVE_POOL_ADDRESS),
            _gaugeTokens: toArray(POLYGON_AAVE_POOL_GAUGE_TOKEN_ADDRESS),
            _validatePools: true
        });
    }

    function test_addGaugeTokensWithoutValidation_success() public {
        __test_addGaugeTokens_success({
            _pools: toArray(POLYGON_AAVE_POOL_ADDRESS, POLYGON_META_POOL_ADDRESS),
            _gaugeTokens: toArray(address(createTestToken()), address(createTestToken())),
            _validatePools: false
        });
    }
}

abstract contract CurvePriceFeedTestArbitrumBase is CurvePriceFeedTestBase {
    function __initialize(EnzymeVersion _version) internal {
        __initialize({
            _version: _version,
            _chainId: ARBITRUM_CHAIN_ID,
            _addressProviderAddress: ADDRESS_PROVIDER_ADDRESS,
            _poolOwnerAddress: ARBITRUM_POOL_OWNER_ADDRESS
        });
    }

    function test_calcUnderlyingValues2Pool_success() public {
        __test_calcUnderlyingValues_success({
            _pool: ARBITRUM_2POOL_ADDRESS,
            _invariantProxyAsset: ARBITRUM_USDC, // TODO: Update to `getUsdEthSimulatedAggregatorForVersion(version)` if we deploy a UsdEthSimualtedAggregator on Arbitrum
            _lpToken: ARBITRUM_2POOL_LP_TOKEN_ADDRESS,
            _gaugeToken: address(0),
            _poolCreationTimestamp: 1631449040,
            _allowedDeviationPer365DaysInBps: 5 * BPS_ONE_PERCENT
        });
    }

    function test_addPoolsNoGauges_success() public {
        __test_addPools_success({
            _pools: toArray(ARBITRUM_2POOL_ADDRESS),
            _reentrantVirtualPrices: toArray(false),
            _lpTokens: toArray(ARBITRUM_2POOL_LP_TOKEN_ADDRESS),
            _gaugeTokens: toArray(address(0)),
            _validatePools: true
        });
    }

    function test_addPoolsWithoutValidation_success() public {
        __test_addPools_success({
            _pools: toArray(ARBITRUM_2POOL_ADDRESS),
            _reentrantVirtualPrices: toArray(true),
            _lpTokens: toArray(address(createTestToken())),
            _gaugeTokens: toArray(address(createTestToken())),
            _validatePools: false
        });
    }
}

contract CurvePriceFeedTestEthereum is CurvePriceFeedTestEthereumBase {
    function setUp() public override {
        __initialize(EnzymeVersion.Current);
    }
}

contract CurvePriceFeedTestEthereumV4 is CurvePriceFeedTestEthereumBase {
    function setUp() public override {
        __initialize(EnzymeVersion.V4);
    }
}

contract CurvePriceFeedPolygon is CurvePriceFeedTestPolygonBase {
    function setUp() public override {
        __initialize(EnzymeVersion.Current);
    }
}

contract CurvePriceFeedTestPolygonV4 is CurvePriceFeedTestPolygonBase {
    function setUp() public override {
        __initialize(EnzymeVersion.V4);
    }
}

contract CurvePriceFeedTestArbitrum is CurvePriceFeedTestArbitrumBase {
    function setUp() public override {
        __initialize(EnzymeVersion.Current);
    }
}

contract CurvePriceFeedTestArbitrumV4 is CurvePriceFeedTestArbitrumBase {
    function setUp() public override {
        __initialize(EnzymeVersion.V4);
    }
}
