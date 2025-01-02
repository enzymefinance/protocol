// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IBalancerV2Vault} from "tests/interfaces/external/IBalancerV2Vault.sol";
import {IERC20} from "tests/interfaces/external/IERC20.sol";

import {IBalancerV2StablePoolPriceFeed} from "tests/interfaces/internal/IBalancerV2StablePoolPriceFeed.sol";
import {IFundDeployer} from "tests/interfaces/internal/IFundDeployer.sol";

import {BalancerV2Reenterer, BalancerV2Utils} from "./BalancerV2Utils.sol";

abstract contract TestBase is IntegrationTest, BalancerV2Utils {
    IBalancerV2Vault constant balancerVault = IBalancerV2Vault(VAULT_ADDRESS);

    IBalancerV2StablePoolPriceFeed internal priceFeed;
    address internal priceFeedOwner;

    // Vars defined by child contract
    // - stable pools info
    address internal poolFactoryAddress;
    bytes32 internal poolId;
    IERC20 internal poolBpt;
    address internal pool2FactoryAddress;
    bytes32 internal pool2Id;
    IERC20 internal pool2Bpt;

    // - price feed config for stable pools
    IERC20 internal poolInvariantProxyAsset;
    IERC20 internal pool2InvariantProxyAsset;

    function setUp() public virtual override {
        // Deploy price feed
        priceFeed = __deployPriceFeed({_poolFactories: new address[](0)});

        priceFeedOwner = core.release.fundDeployer.getOwner();
    }

    // DEPLOYMENT HELPERS

    function __deployPriceFeed(address[] memory _poolFactories)
        internal
        returns (IBalancerV2StablePoolPriceFeed balancerV2StablePoolPriceFeed_)
    {
        bytes memory args = abi.encode(core.release.fundDeployer, address(balancerVault), _poolFactories);

        return IBalancerV2StablePoolPriceFeed(deployCode("BalancerV2StablePoolPriceFeed.sol", args));
    }
}

abstract contract ValueTest is TestBase {
    // Also acts as a a success case for calcUnderlyingValues
    function test_successViaValueInterpreter() public {
        // Register the bpt:
        // 1. register the pool factory on the price feed
        // 2. register the pool on the price feed
        // 3. register the bpt (pool) as a derivative on the ValueInterpreter
        vm.startPrank(priceFeedOwner);
        priceFeed.addPoolFactories(toArray(poolFactoryAddress));
        priceFeed.addPools({
            _pools: toArray(address(poolBpt)),
            _invariantProxyAssets: toArray(address(poolInvariantProxyAsset))
        });
        vm.stopPrank();
        addDerivative({
            _valueInterpreter: core.release.valueInterpreter,
            _tokenAddress: address(poolBpt),
            _priceFeedAddress: address(priceFeed),
            _skipIfRegistered: false
        });

        // Stable pools should slowly trend upwards from 1 unit of the invariant proxy asset (IPA)
        // so assert the bpt value is between 1 and 1.10 unit
        uint256 bptIPAPrice = calcTokenPrice({
            _valueInterpreter: core.release.valueInterpreter,
            _baseAsset: poolBpt,
            _quoteAsset: poolInvariantProxyAsset
        });
        uint256 oneIPAUnit = assetUnit(poolInvariantProxyAsset);
        assertTrue(bptIPAPrice > oneIPAUnit, "bpt <= 1 unit");
        assertTrue(bptIPAPrice < oneIPAUnit + oneIPAUnit / 10, "bpt >= 1.10 unit");
    }

    function test_calcCanonicalAssetValue_failsWithReentrancy() public {
        // Register the bpt on the price feed
        vm.startPrank(priceFeedOwner);
        priceFeed.addPoolFactories(toArray(poolFactoryAddress));
        priceFeed.addPools({
            _pools: toArray(address(poolBpt)),
            _invariantProxyAssets: toArray(address(poolInvariantProxyAsset))
        });
        vm.stopPrank();

        // Define an asset and amount to use in the reentrant join
        IERC20 joinAsset;
        (address[] memory poolTokens,,) = balancerVault.getPoolTokens(poolId);
        if (poolTokens[0] == address(poolBpt)) {
            joinAsset = IERC20(poolTokens[1]);
        } else {
            joinAsset = IERC20(poolTokens[0]);
        }
        uint256 joinAmount = assetUnit(joinAsset) * 10;

        // Deploy a reentering contract and seed it with (1) 1 wei of native asset and (2) the join asset
        BalancerV2Reenterer.ReentrantCall memory reentrantCall = BalancerV2Reenterer.ReentrantCall({
            target: address(priceFeed),
            data: abi.encodeWithSelector(
                priceFeed.calcUnderlyingValues.selector, address(poolBpt), address(poolInvariantProxyAsset), 1
            )
        });
        BalancerV2Reenterer reenterer = new BalancerV2Reenterer(reentrantCall);
        increaseTokenBalance(joinAsset, address(reenterer), joinAmount);
        deal(address(reenterer), 1 ether);

        // Joining via reentering contract should fail with a reentrancy error.
        // BAL#420 is the "ADDRESS_CANNOT_SEND_VALUE" error,
        // which throws because the reentrant call happens while receiving the native asset refund.
        // (The failure on the reentrant call can be confirmed in Forge's logs if running this test with high verbosity)
        vm.expectRevert("BAL#420");
        reenterer.join{value: 1}({_poolId: poolId, _joinAsset: joinAsset, _joinAmount: joinAmount});
    }
}

abstract contract RegistryTest is TestBase {
    event PoolAdded(address indexed pool, address indexed invariantProxyAsset);

    event PoolFactoryAdded(address indexed poolFactory);

    event PoolFactoryRemoved(address indexed poolFactory);

    event PoolRemoved(address indexed pool);

    address internal randomCallerAddress = makeAddr("randomCaller");
    address[] internal fakePoolFactoryAddresses = toArray(makeAddr("FakePoolFactoryA"), makeAddr("FakePoolFactoryB"));

    // POOL FACTORIES

    function test_addPoolFactories_failsWithUnauthorized() public {
        vm.expectRevert("onlyFundDeployerOwner: Only the FundDeployer owner can call this function");
        vm.prank(randomCallerAddress);
        priceFeed.addPoolFactories(fakePoolFactoryAddresses);
    }

    function test_addPoolFactories_success() public {
        // Assert that no factories are unregistered at the start
        assertEq(priceFeed.getPoolFactories(), new address[](0), "pool factories already registered");

        // Define events to assert
        for (uint256 i; i < fakePoolFactoryAddresses.length; i++) {
            expectEmit(address(priceFeed));
            emit PoolFactoryAdded(fakePoolFactoryAddresses[i]);
        }

        // Add the pool factories
        vm.prank(priceFeedOwner);
        priceFeed.addPoolFactories(fakePoolFactoryAddresses);

        // Attempt to add a duplicate factory
        vm.prank(priceFeedOwner);
        priceFeed.addPoolFactories(toArray(fakePoolFactoryAddresses[0]));

        // Assert the factories are now registered, with the duplicate omitted
        assertEq(priceFeed.getPoolFactories(), fakePoolFactoryAddresses, "pool factories not registered");
    }

    function test_removePoolFactories_failsWithUnauthorized() public {
        vm.expectRevert("onlyFundDeployerOwner: Only the FundDeployer owner can call this function");
        vm.prank(randomCallerAddress);
        priceFeed.removePoolFactories(toArray(poolFactoryAddress));
    }

    function test_removePoolFactories_success() public {
        // Register the factories to remove
        vm.prank(priceFeedOwner);
        priceFeed.addPoolFactories(fakePoolFactoryAddresses);

        // Define events to assert
        for (uint256 i; i < fakePoolFactoryAddresses.length; i++) {
            expectEmit(address(priceFeed));
            emit PoolFactoryRemoved(fakePoolFactoryAddresses[i]);
        }

        // Remove the pool factories
        vm.prank(priceFeedOwner);
        priceFeed.removePoolFactories(fakePoolFactoryAddresses);

        // Assert the factories have been deregistered
        assertEq(priceFeed.getPoolFactories(), new address[](0), "pool factories not deregistered");
    }

    // POOLS
    function test_addPools_failsWithUnauthorized() public {
        vm.expectRevert("onlyFundDeployerOwner: Only the FundDeployer owner can call this function");
        vm.prank(randomCallerAddress);
        priceFeed.addPools(toArray(address(poolBpt)), toArray(address(poolInvariantProxyAsset)));
    }

    function test_addPools_failsWithInvalidFactory() public {
        // Attempting to add the pool without the factory registered should fail
        vm.expectRevert("addPools: Invalid factory");
        vm.prank(priceFeedOwner);
        priceFeed.addPools(toArray(address(poolBpt)), toArray(address(poolInvariantProxyAsset)));
    }

    function test_addPools_failsWithDuplicate() public {
        vm.startPrank(priceFeedOwner);

        // Add the pool's factory to the price feed
        priceFeed.addPoolFactories(toArray(poolFactoryAddress));

        // Add the pool to the price feed
        priceFeed.addPools(toArray(address(poolBpt)), toArray(address(poolInvariantProxyAsset)));

        // Attempting to add the pool again should fail
        vm.expectRevert("addPools: Already registered");
        priceFeed.addPools(toArray(address(poolBpt)), toArray(address(poolInvariantProxyAsset)));

        vm.stopPrank();
    }

    function test_addPools_success() public {
        address[] memory pools = toArray(address(poolBpt), address(pool2Bpt));
        address[] memory invariantProxyAssets =
            toArray(address(poolInvariantProxyAsset), address(pool2InvariantProxyAsset));

        // Assert the pools are not registered
        for (uint256 i; i < pools.length; i++) {
            assertFalse(priceFeed.isSupportedAsset(pools[i]), "pool already registered");
        }

        // Add the pools factories to the price feed
        vm.prank(priceFeedOwner);
        priceFeed.addPoolFactories(toArray(poolFactoryAddress, pool2FactoryAddress));

        // Define events to assert
        for (uint256 i; i < pools.length; i++) {
            expectEmit(address(priceFeed));
            emit PoolAdded(pools[i], invariantProxyAssets[i]);
        }

        // Add the pools to the price feed
        vm.prank(priceFeedOwner);
        priceFeed.addPools(pools, invariantProxyAssets);

        // Assert the pools are now registered
        for (uint256 i; i < pools.length; i++) {
            assertTrue(priceFeed.isSupportedAsset(pools[i]), "pool not registered");

            IBalancerV2StablePoolPriceFeed.PoolInfo memory poolInfo = priceFeed.getPoolInfo(pools[i]);
            assertEq(poolInfo.invariantProxyAsset, invariantProxyAssets[i], "invariant proxy asset incorrect");
            assertEq(
                poolInfo.invariantProxyAssetDecimals,
                IERC20(invariantProxyAssets[i]).decimals(),
                "invariant proxy asset decimals incorrect"
            );
        }
    }
}

contract EthereumTest is ValueTest, RegistryTest {
    function setUp() public override {
        setUpMainnetEnvironment();

        // Define pools to use throughout
        poolFactoryAddress = ETHEREUM_USDC_DAI_USDT_POOL_FACTORY_ADDRESS;
        poolId = ETHEREUM_USDC_DAI_USDT_POOL_ID;
        poolBpt = IERC20(ETHEREUM_USDC_DAI_USDT_POOL_ADDRESS);
        poolInvariantProxyAsset = getCoreToken("USD");

        pool2FactoryAddress = ETHEREUM_AAVE_BOOSTED_STABLE_POOL_FACTORY_ADDRESS;
        pool2Id = ETHEREUM_AAVE_BOOSTED_STABLE_POOL_ID;
        pool2Bpt = IERC20(ETHEREUM_AAVE_BOOSTED_STABLE_POOL_ADDRESS);
        pool2InvariantProxyAsset = getCoreToken("USD");

        super.setUp();
    }
}

contract PolygonTest is ValueTest, RegistryTest {
    function setUp() public override {
        setUpPolygonEnvironment();

        // Define pools to use throughout
        poolFactoryAddress = POLYGON_wMATIC_stMATIC_POOL_FACTORY_ADDRESS;
        poolId = POLYGON_wMATIC_stMATIC_POOL_ID;
        poolBpt = IERC20(POLYGON_wMATIC_stMATIC_POOL_ADDRESS);
        poolInvariantProxyAsset = getCoreToken("WMATIC");

        pool2FactoryAddress = POLYGON_wstETH_BOOSTED_aWETH_POOL_FACTORY_ADDRESS;
        pool2Id = POLYGON_wstETH_BOOSTED_aWETH_POOL_ID;
        pool2Bpt = IERC20(POLYGON_wstETH_BOOSTED_aWETH_POOL_ADDRESS);
        pool2InvariantProxyAsset = IERC20(POLYGON_WETH); // not in core assets

        super.setUp();
    }
}
