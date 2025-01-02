// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IPolicyManager as IPolicyManagerProd} from "contracts/release/extensions/policy-manager/IPolicyManager.sol";
import {IChainlinkPriceFeedMixin as IChainlinkPriceFeedMixinProd} from
    "contracts/release/infrastructure/price-feeds/primitives/IChainlinkPriceFeedMixin.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";
import {TestChainlinkAggregator} from "tests/utils/core/AssetUniverseUtils.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";

import {INoDepegOnRedeemSharesForSpecificAssetsPolicy as INoDepegPolicy} from
    "tests/interfaces/internal/INoDepegOnRedeemSharesForSpecificAssetsPolicy.sol";

/// @dev Written as integration test since it relies on ValueInterpreter interactions
contract NoDepegOnRedeemSharesForSpecificAssetsPolicyTest is IntegrationTest {
    event FundSettingsUpdated(address indexed comptrollerProxy, INoDepegPolicy.AssetConfig[] assetConfigs);

    bytes private constant ERROR_MESSAGE_ONLY_POLICY_MANAGER = "Only the PolicyManager can make this call";
    uint256 private constant ONE_HUNDRED_PERCENT_FOR_POLICY = BPS_ONE_HUNDRED_PERCENT;

    INoDepegPolicy.PolicyHook internal policyHook =
        INoDepegPolicy.PolicyHook.wrap(uint8(IPolicyManagerProd.PolicyHook.RedeemSharesForSpecificAssets));
    INoDepegPolicy internal policy;
    IERC20 internal simulatedUsd;
    IERC20 internal ethPeggedAsset;
    IERC20 internal usdPeggedAsset;
    TestChainlinkAggregator internal ethPeggedAssetAggregator;
    TestChainlinkAggregator internal usdPeggedAssetAggregator;
    address internal comptrollerProxyAddress = makeAddr("ComptrollerProxyAddress");

    function setUp() public override {
        super.setUp();

        simulatedUsd = getCoreToken("USD");

        // Deploy policy
        bytes memory policyArgs = abi.encode(core.release.policyManager, core.release.valueInterpreter);
        policy = INoDepegPolicy(deployCode("NoDepegOnRedeemSharesForSpecificAssetsPolicy.sol", policyArgs));

        // Create mock assets
        // Use different, non-18 decimals to test rule formula
        ethPeggedAsset = createTestToken({_decimals: 8});
        usdPeggedAsset = createTestToken({_decimals: 12});

        // Create mock aggregators for the assets (starting at 1:1 with their pegged assets)
        ethPeggedAssetAggregator = createTestAggregator({_decimals: CHAINLINK_AGGREGATOR_DECIMALS_ETH});
        usdPeggedAssetAggregator = createTestAggregator({_decimals: CHAINLINK_AGGREGATOR_DECIMALS_USD});

        // Register mock assets as primitives
        addPrimitive({
            _valueInterpreter: core.release.valueInterpreter,
            _tokenAddress: address(ethPeggedAsset),
            _aggregatorAddress: address(ethPeggedAssetAggregator),
            _rateAsset: IChainlinkPriceFeedMixinProd.RateAsset.ETH,
            _skipIfRegistered: false
        });
        addPrimitive({
            _valueInterpreter: core.release.valueInterpreter,
            _tokenAddress: address(usdPeggedAsset),
            _aggregatorAddress: address(usdPeggedAssetAggregator),
            _rateAsset: IChainlinkPriceFeedMixinProd.RateAsset.USD,
            _skipIfRegistered: false
        });
    }

    // HELPERS

    function __encodeFundSettings(INoDepegPolicy.AssetConfig[] memory _assetConfigs)
        private
        pure
        returns (bytes memory encodedSettings_)
    {
        return abi.encode(_assetConfigs);
    }

    // TESTS

    function test_addFundSettings_failsWithDeviationToleranceOfZero() public {
        INoDepegPolicy.AssetConfig[] memory assetConfigs = new INoDepegPolicy.AssetConfig[](1);
        assetConfigs[0] = INoDepegPolicy.AssetConfig({
            asset: address(ethPeggedAsset),
            referenceAsset: address(wethToken),
            deviationToleranceInBps: 0
        });

        bytes memory encodedSettings = __encodeFundSettings({_assetConfigs: assetConfigs});

        vm.expectRevert("__updateFundSettings: Missing deviation tolerance");
        vm.prank(address(core.release.policyManager));
        policy.addFundSettings({_comptrollerProxy: comptrollerProxyAddress, _encodedSettings: encodedSettings});
    }

    function test_addFundSettings_failsWithDeviationToleranceMax() public {
        INoDepegPolicy.AssetConfig[] memory assetConfigs = new INoDepegPolicy.AssetConfig[](1);
        assetConfigs[0] = INoDepegPolicy.AssetConfig({
            asset: address(ethPeggedAsset),
            referenceAsset: address(wethToken),
            deviationToleranceInBps: uint16(ONE_HUNDRED_PERCENT_FOR_POLICY)
        });

        bytes memory encodedSettings = __encodeFundSettings({_assetConfigs: assetConfigs});

        vm.expectRevert("__updateFundSettings: Max deviation tolerance");
        vm.prank(address(core.release.policyManager));
        policy.addFundSettings({_comptrollerProxy: comptrollerProxyAddress, _encodedSettings: encodedSettings});
    }

    function test_addFundSettings_failsWithOnlyPolicyManager() public {
        vm.expectRevert(ERROR_MESSAGE_ONLY_POLICY_MANAGER);
        policy.addFundSettings({_comptrollerProxy: comptrollerProxyAddress, _encodedSettings: ""});
    }

    function test_addFundSettings_success() public {
        INoDepegPolicy.AssetConfig[] memory assetConfigs = new INoDepegPolicy.AssetConfig[](2);
        assetConfigs[0] = INoDepegPolicy.AssetConfig({
            asset: address(ethPeggedAsset),
            referenceAsset: address(wethToken),
            deviationToleranceInBps: uint16(ONE_HUNDRED_PERCENT_FOR_POLICY / 100)
        });
        assetConfigs[1] = INoDepegPolicy.AssetConfig({
            asset: address(usdPeggedAsset),
            referenceAsset: address(simulatedUsd),
            deviationToleranceInBps: uint16(ONE_HUNDRED_PERCENT_FOR_POLICY / 10)
        });

        bytes memory encodedSettings = __encodeFundSettings({_assetConfigs: assetConfigs});

        // Define expected event emission
        expectEmit(address(policy));
        emit FundSettingsUpdated(comptrollerProxyAddress, assetConfigs);

        // Add the fund settings
        vm.prank(address(core.release.policyManager));
        policy.addFundSettings({_comptrollerProxy: comptrollerProxyAddress, _encodedSettings: encodedSettings});

        // Validate stored settings match input settings
        INoDepegPolicy.AssetConfig[] memory storedAssetConfigs = policy.getAssetConfigsForFund(comptrollerProxyAddress);
        assertEq(assetConfigs.length, storedAssetConfigs.length, "Asset configs length mismatch");

        for (uint256 i; i < assetConfigs.length; i++) {
            INoDepegPolicy.AssetConfig memory inputAssetConfig = assetConfigs[i];
            INoDepegPolicy.AssetConfig memory storedAssetConfig = storedAssetConfigs[i];

            assertEq(inputAssetConfig.asset, storedAssetConfig.asset, "Asset mismatch");
            assertEq(inputAssetConfig.referenceAsset, storedAssetConfig.referenceAsset, "Reference asset mismatch");
            assertEq(
                inputAssetConfig.deviationToleranceInBps,
                storedAssetConfig.deviationToleranceInBps,
                "Deviation tolerance mismatch"
            );
        }
    }

    function test_canDisable_returnsTrue() public {
        assertTrue(policy.canDisable());
    }

    function test_updateFundSettings_failsWithOnlyPolicyManager() public {
        vm.expectRevert(ERROR_MESSAGE_ONLY_POLICY_MANAGER);
        policy.updateFundSettings({_comptrollerProxy: comptrollerProxyAddress, _encodedSettings: ""});
    }

    function test_updateFundSettings_success() public {
        // Register some initial fund settings
        {
            INoDepegPolicy.AssetConfig[] memory initialAssetConfigs = new INoDepegPolicy.AssetConfig[](2);
            initialAssetConfigs[0] = INoDepegPolicy.AssetConfig({
                asset: address(ethPeggedAsset),
                referenceAsset: address(wethToken),
                deviationToleranceInBps: uint16(ONE_HUNDRED_PERCENT_FOR_POLICY / 100)
            });
            initialAssetConfigs[1] = INoDepegPolicy.AssetConfig({
                asset: address(usdPeggedAsset),
                referenceAsset: address(simulatedUsd),
                deviationToleranceInBps: uint16(ONE_HUNDRED_PERCENT_FOR_POLICY / 10)
            });
            bytes memory initialEncodedSettings = __encodeFundSettings({_assetConfigs: initialAssetConfigs});

            vm.prank(address(core.release.policyManager));
            policy.addFundSettings({
                _comptrollerProxy: comptrollerProxyAddress,
                _encodedSettings: initialEncodedSettings
            });
        }

        // Define new fund settings
        INoDepegPolicy.AssetConfig[] memory nextAssetConfigs = new INoDepegPolicy.AssetConfig[](1);
        nextAssetConfigs[0] = INoDepegPolicy.AssetConfig({
            asset: address(usdPeggedAsset),
            referenceAsset: address(simulatedUsd),
            deviationToleranceInBps: uint16(ONE_HUNDRED_PERCENT_FOR_POLICY / 30)
        });
        bytes memory nextEncodedSettings = __encodeFundSettings({_assetConfigs: nextAssetConfigs});

        // Define expected event emission
        expectEmit(address(policy));
        emit FundSettingsUpdated(comptrollerProxyAddress, nextAssetConfigs);

        // Update the fund settings
        vm.prank(address(core.release.policyManager));
        policy.updateFundSettings({_comptrollerProxy: comptrollerProxyAddress, _encodedSettings: nextEncodedSettings});

        // Validate stored settings match input settings
        INoDepegPolicy.AssetConfig[] memory storedAssetConfigs = policy.getAssetConfigsForFund(comptrollerProxyAddress);
        assertEq(nextAssetConfigs.length, storedAssetConfigs.length, "Asset configs length mismatch");

        for (uint256 i; i < nextAssetConfigs.length; i++) {
            INoDepegPolicy.AssetConfig memory inputAssetConfig = nextAssetConfigs[i];
            INoDepegPolicy.AssetConfig memory storedAssetConfig = storedAssetConfigs[i];

            assertEq(inputAssetConfig.asset, storedAssetConfig.asset, "Asset mismatch");
            assertEq(inputAssetConfig.referenceAsset, storedAssetConfig.referenceAsset, "Reference asset mismatch");
            assertEq(
                inputAssetConfig.deviationToleranceInBps,
                storedAssetConfig.deviationToleranceInBps,
                "Deviation tolerance mismatch"
            );
        }
    }

    function test_validateRule_success() public {
        // Define asset configs
        INoDepegPolicy.AssetConfig memory ethPeggedAssetConfig = INoDepegPolicy.AssetConfig({
            asset: address(ethPeggedAsset),
            referenceAsset: address(wethToken),
            deviationToleranceInBps: uint16(ONE_HUNDRED_PERCENT_FOR_POLICY / 100)
        });
        INoDepegPolicy.AssetConfig memory usdPeggedAssetConfig = INoDepegPolicy.AssetConfig({
            asset: address(usdPeggedAsset),
            referenceAsset: address(simulatedUsd),
            deviationToleranceInBps: uint16(ONE_HUNDRED_PERCENT_FOR_POLICY / 10)
        });

        // Calculate raw deviation tolerance
        uint256 ethPeggedAssetLowerBound;
        uint256 ethPeggedAssetUpperBound;
        uint256 usdPeggedAssetLowerBound;
        uint256 usdPeggedAssetUpperBound;
        {
            uint256 ethPeggedAssetRawTolerance = CHAINLINK_AGGREGATOR_PRECISION_ETH
                * ethPeggedAssetConfig.deviationToleranceInBps / ONE_HUNDRED_PERCENT_FOR_POLICY;
            ethPeggedAssetLowerBound = CHAINLINK_AGGREGATOR_PRECISION_ETH - ethPeggedAssetRawTolerance;
            ethPeggedAssetUpperBound = CHAINLINK_AGGREGATOR_PRECISION_ETH + ethPeggedAssetRawTolerance;

            uint256 usdPeggedAssetRawTolerance = CHAINLINK_AGGREGATOR_PRECISION_USD
                * usdPeggedAssetConfig.deviationToleranceInBps / ONE_HUNDRED_PERCENT_FOR_POLICY;
            usdPeggedAssetLowerBound = CHAINLINK_AGGREGATOR_PRECISION_USD - usdPeggedAssetRawTolerance;
            usdPeggedAssetUpperBound = CHAINLINK_AGGREGATOR_PRECISION_USD + usdPeggedAssetRawTolerance;
        }

        // Register fund settings
        {
            INoDepegPolicy.AssetConfig[] memory assetConfigs = new INoDepegPolicy.AssetConfig[](2);
            assetConfigs[0] = ethPeggedAssetConfig;
            assetConfigs[1] = usdPeggedAssetConfig;
            bytes memory encodedSettings = __encodeFundSettings({_assetConfigs: assetConfigs});

            vm.prank(address(core.release.policyManager));
            policy.addFundSettings({_comptrollerProxy: comptrollerProxyAddress, _encodedSettings: encodedSettings});
        }

        // Rule should initially PASS
        assertTrue(policy.validateRule(comptrollerProxyAddress, policyHook, ""), "control case");

        uint256 smallArbitraryOffset = 10;

        // Push asset prices to just within the lower bound; rule should PASS
        ethPeggedAssetAggregator.setPrice(ethPeggedAssetLowerBound + smallArbitraryOffset);
        usdPeggedAssetAggregator.setPrice(usdPeggedAssetLowerBound + smallArbitraryOffset);
        assertTrue(policy.validateRule(comptrollerProxyAddress, policyHook, ""), "within lower bound");

        // Push ETH asset price to just outside of the lower bound; rule should now FAIL
        ethPeggedAssetAggregator.setPrice(ethPeggedAssetLowerBound - smallArbitraryOffset);
        assertFalse(policy.validateRule(comptrollerProxyAddress, policyHook, ""), "outside of lower bound");

        // Push asset prices to just within the upper bound; rule should PASS
        ethPeggedAssetAggregator.setPrice(ethPeggedAssetUpperBound - smallArbitraryOffset);
        usdPeggedAssetAggregator.setPrice(usdPeggedAssetUpperBound - smallArbitraryOffset);
        assertTrue(policy.validateRule(comptrollerProxyAddress, policyHook, ""), "within upper bound");

        // Push USD asset price to just outside of the upper bound; rule should now FAIL
        usdPeggedAssetAggregator.setPrice(usdPeggedAssetUpperBound + smallArbitraryOffset);
        assertFalse(policy.validateRule(comptrollerProxyAddress, policyHook, ""), "outside of upper bound");
    }
}
