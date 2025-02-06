// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IBalancerV2Vault} from "tests/interfaces/external/IBalancerV2Vault.sol";
import {IERC20} from "tests/interfaces/external/IERC20.sol";

import {IBalancerV2WeightedPoolPriceFeed} from "tests/interfaces/internal/IBalancerV2WeightedPoolPriceFeed.sol";
import {IFundDeployer} from "tests/interfaces/internal/IFundDeployer.sol";

import {BalancerV2Reenterer, BalancerV2Utils} from "./BalancerV2Utils.sol";

abstract contract TestBase is IntegrationTest, BalancerV2Utils {
    IBalancerV2Vault constant balancerVault = IBalancerV2Vault(VAULT_ADDRESS);

    IBalancerV2WeightedPoolPriceFeed internal priceFeed;
    address internal priceFeedOwner;

    // Vars defined by child contract
    // - price feed config
    IERC20 internal intermediaryAsset;
    // - pools info
    address internal poolFactoryAddress;
    bytes32 internal poolId;
    IERC20 internal poolBpt;
    // - pools price estimation
    uint256 internal poolBptExpectedUsdIntegerPrice;

    function setUp() public virtual override {
        // Deploy price feed
        priceFeed = __deployPriceFeed();

        priceFeedOwner = core.release.fundDeployer.getOwner();
    }

    // DEPLOYMENT HELPERS

    function __deployPriceFeed() internal returns (IBalancerV2WeightedPoolPriceFeed balancerV2WeightedPoolPriceFeed_) {
        bytes memory args = abi.encode(
            core.release.fundDeployer,
            address(core.release.valueInterpreter),
            address(intermediaryAsset),
            address(balancerVault),
            new address[](0)
        );

        return IBalancerV2WeightedPoolPriceFeed(deployCode("BalancerV2WeightedPoolPriceFeed.sol", args));
    }
}

abstract contract ValueTest is TestBase {
    // Also acts as a a success case for calcUnderlyingValues
    function test_successViaValueInterpreter() public {
        // Register the bpt:
        // 1. register the pool factory on the price feed
        // 2. register the bpt (pool) as a derivative on the ValueInterpreter
        vm.prank(priceFeedOwner);
        priceFeed.addPoolFactories(toArray(poolFactoryAddress));
        addDerivative({
            _valueInterpreter: core.release.valueInterpreter,
            _tokenAddress: address(poolBpt),
            _priceFeedAddress: address(priceFeed),
            _skipIfRegistered: false
        });

        // Assert the price equals the off-chain price.
        // Remove decimals for readability.
        IERC20 simulatedUsd = getCoreToken("USD");
        uint256 bptUsdPrice = calcTokenPrice({
            _valueInterpreter: core.release.valueInterpreter,
            _baseAsset: poolBpt,
            _quoteAsset: simulatedUsd
        });
        uint256 bptUsdIntegerPrice = bptUsdPrice / (10 ** simulatedUsd.decimals());
        assertEq(bptUsdIntegerPrice, poolBptExpectedUsdIntegerPrice, "Wrong bpt price");
    }

    function test_calcCanonicalAssetValue_failsWithReentrancy() public {
        // Register the bpt factory on the price feed
        vm.prank(priceFeedOwner);
        priceFeed.addPoolFactories(toArray(poolFactoryAddress));

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
        IERC20 simulatedUsd = getCoreToken("USD");
        BalancerV2Reenterer.ReentrantCall memory reentrantCall = BalancerV2Reenterer.ReentrantCall({
            target: address(priceFeed),
            data: abi.encodeWithSelector(
                priceFeed.calcUnderlyingValues.selector, address(poolBpt), address(simulatedUsd), 1
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
    event PoolFactoryAdded(address poolFactory);

    event PoolFactoryRemoved(address poolFactory);

    address internal randomCallerAddress = makeAddr("randomCaller");
    address[] internal fakePoolFactoryAddresses = toArray(makeAddr("FakePoolFactoryA"), makeAddr("FakePoolFactoryB"));

    // POOL FACTORIES

    function test_addPoolFactories_failsWithUnauthorized() public {
        vm.expectRevert("onlyFundDeployerOwner: Only the FundDeployer owner can call this function");
        vm.prank(randomCallerAddress);
        priceFeed.addPoolFactories(fakePoolFactoryAddresses);
    }

    function test_addPoolFactories_success() public {
        // Assert that no factories are registered at the start
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

    function test_isSupportedAsset_success() public {
        // Assert that the btp is not supported
        assertFalse(priceFeed.isSupportedAsset(address(poolBpt)), "bpt already supported");

        // Add the bpt's factory
        vm.prank(priceFeedOwner);
        priceFeed.addPoolFactories(toArray(poolFactoryAddress));

        // The bpt should now be supported
        assertTrue(priceFeed.isSupportedAsset(address(poolBpt)), "bpt not supported after adding its factory");
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
}

contract EthereumTest is ValueTest, RegistryTest {
    function setUp() public override {
        setUpMainnetEnvironment(ETHEREUM_BLOCK_TIME_SENSITIVE);

        // Price feed config
        intermediaryAsset = getCoreToken("WETH");

        // Define pools to use throughout
        poolFactoryAddress = ETHEREUM_80_BAL_20_WETH_POOL_FACTORY_ADDRESS;
        poolId = ETHEREUM_80_BAL_20_WETH_POOL_ID;
        poolBpt = IERC20(ETHEREUM_80_BAL_20_WETH_POOL_ADDRESS);
        // $9 on Jan 26th 2025
        // See: https://app.zerion.io/tokens/B-80BAL-20WETH-0x5c6ee304399dbdb9c8ef030ab642b10820db8f56
        poolBptExpectedUsdIntegerPrice = 9;

        super.setUp();
    }
}

contract PolygonTest is ValueTest, RegistryTest {
    function setUp() public override {
        setUpPolygonEnvironment(POLYGON_BLOCK_TIME_SENSITIVE);

        // Price feed config
        intermediaryAsset = getCoreToken("USD");

        // Define pools to use throughout
        poolFactoryAddress = POLYGON_TRICRYPTO_POOL_FACTORY_ADDRESS;
        poolId = POLYGON_TRICRYPTO_POOL_ID;
        poolBpt = IERC20(POLYGON_TRICRYPTO_POOL_ADDRESS);
        // $690 on March 21st, 2024
        // See: https://app.apy.vision/pools/balancerv2_matic-WBTC-USDC-WETH-0x03cd191f589d12b0582a99808cf19851e468e6b5
        poolBptExpectedUsdIntegerPrice = 690;

        super.setUp();
    }
}
