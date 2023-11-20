// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {CoreUtils} from "tests/utils/CoreUtils.sol";
import {ChainlinkRateAsset, TestAggregator} from "tests/utils/core/AssetUniverseUtils.sol";

import {
    Contracts as PersistentContracts,
    getMainnetDeployment as getMainnetPersistentContracts,
    getPolygonDeployment as getPolygonPersistentContracts
} from "tests/utils/core/deployment/PersistentContracts.sol";
import {ReleaseConfig} from "tests/utils/core/deployment/DeploymentUtils.sol";
import {
    Contracts as V4ReleaseContracts,
    getMainnetDeployment as getV4MainnetReleaseContracts,
    getPolygonDeployment as getV4PolygonReleaseContracts
} from "tests/utils/core/deployment/V4ReleaseContracts.sol";
import {
    Contracts as ReleaseContracts,
    getMainnetDeployment as getMainnetReleaseContracts,
    getPolygonDeployment as getPolygonReleaseContracts
} from "tests/utils/core/deployment/V5ReleaseContracts.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";

import {IComptrollerLib} from "tests/interfaces/internal/IComptrollerLib.sol";
import {IFundDeployer} from "tests/interfaces/internal/IFundDeployer.sol";
import {IIntegrationManager} from "tests/interfaces/internal/IIntegrationManager.sol";
import {IValueInterpreter} from "tests/interfaces/internal/IValueInterpreter.sol";
import {IVaultLib} from "tests/interfaces/internal/IVaultLib.sol";

// v4 interfaces
import {IComptrollerLib as IV4ComptrollerLib} from "tests/interfaces/internal/v4/IComptrollerLib.sol";
import {IFundDeployer as IV4FundDeployer} from "tests/interfaces/internal/v4/IFundDeployer.sol";

struct CorePrimitiveInput {
    string symbol;
    address assetAddress;
    address aggregatorAddress;
    ChainlinkRateAsset rateAsset;
}

struct Deployment {
    ReleaseConfig lastReleaseConfig;
    ReleaseContracts release;
    PersistentContracts persistent;
}

abstract contract IntegrationTest is CoreUtils {
    IERC20 internal mlnToken;
    IERC20 internal wethToken;
    IERC20 internal wrappedNativeToken;

    IERC20 internal standardPrimitive;
    IERC20 internal nonStandardPrimitive;

    Deployment internal core;
    V4ReleaseContracts internal v4ReleaseContracts;
    // Don't allow access outside of this contract
    mapping(string => IERC20) private symbolToCoreToken;
    mapping(IERC20 => bool) private tokenToIsCore;

    // Default setup()

    function setUp() public virtual {
        setUpStandaloneEnvironment();
    }

    // Live deployments

    function setUpLiveMainnetEnvironment(uint256 _forkBlock) internal {
        vm.createSelectFork("mainnet", _forkBlock);

        core.persistent = getMainnetPersistentContracts();
        core.release = getMainnetReleaseContracts();
    }

    function setUpLivePolygonEnvironment(uint256 _forkBlock) internal {
        vm.createSelectFork("polygon", _forkBlock);

        core.persistent = getPolygonPersistentContracts();
        core.release = getPolygonReleaseContracts();
    }

    // Partially-live deployments (persistent layer only)

    function setUpLiveMainnetEnvironmentWithNewRelease(uint256 _forkBlock) internal {
        vm.createSelectFork("mainnet", _forkBlock);

        core.persistent = getMainnetPersistentContracts();

        __setUpEnvironment({_config: getDefaultMainnetConfig(), _persistentContractsAlreadySet: true});
    }

    function setUpLivePolygonEnvironmentWithNewRelease(uint256 _forkBlock) internal {
        vm.createSelectFork("polygon", _forkBlock);

        core.persistent = getPolygonPersistentContracts();

        __setUpEnvironment({_config: getDefaultPolygonConfig(), _persistentContractsAlreadySet: true});
    }

    // New deployments

    function setUpMainnetEnvironment() internal {
        setUpMainnetEnvironment(ETHEREUM_BLOCK_LATEST);
    }

    function setUpPolygonEnvironment() internal {
        setUpPolygonEnvironment(POLYGON_BLOCK_LATEST);
    }

    function setUpGoerliEnvironment() internal {
        setUpGoerliEnvironment(GOERLI_BLOCK_LATEST);
    }

    function setUpMainnetEnvironment(uint256 _forkBlock) internal {
        vm.createSelectFork("mainnet", _forkBlock);

        v4ReleaseContracts = getV4MainnetReleaseContracts();

        ReleaseConfig memory config = getDefaultMainnetConfig();

        __setUpEnvironment({_config: config, _persistentContractsAlreadySet: false});

        // Deploy minimal asset universe

        // Treat WETH specially and directly add to coreTokens storage (does not require an aggregator)
        symbolToCoreToken["WETH"] = IERC20(wethToken);
        tokenToIsCore[IERC20(wethToken)] = true;

        address simulatedUsdAddress = address(deployUsdEthSimulatedAggregator(config.chainlinkEthUsdAggregatorAddress));

        CorePrimitiveInput[] memory corePrimitives = new CorePrimitiveInput[](6);
        // System primitives
        corePrimitives[0] = CorePrimitiveInput({
            symbol: "MLN",
            assetAddress: ETHEREUM_MLN,
            aggregatorAddress: ETHEREUM_MLN_ETH_AGGREGATOR,
            rateAsset: ChainlinkRateAsset.ETH
        });
        // Extra primitives
        corePrimitives[1] = CorePrimitiveInput({
            symbol: "USD",
            assetAddress: simulatedUsdAddress,
            aggregatorAddress: simulatedUsdAddress,
            rateAsset: ChainlinkRateAsset.ETH
        });
        corePrimitives[2] = CorePrimitiveInput({
            symbol: "USDC",
            assetAddress: ETHEREUM_USDC,
            aggregatorAddress: ETHEREUM_USDC_ETH_AGGREGATOR,
            rateAsset: ChainlinkRateAsset.ETH
        });
        corePrimitives[3] = CorePrimitiveInput({
            symbol: "BAL",
            assetAddress: ETHEREUM_BAL,
            aggregatorAddress: ETHEREUM_BAL_ETH_AGGREGATOR,
            rateAsset: ChainlinkRateAsset.ETH
        });
        corePrimitives[4] = CorePrimitiveInput({
            symbol: "USDT",
            assetAddress: ETHEREUM_USDT,
            aggregatorAddress: ETHEREUM_USDT_ETH_AGGREGATOR,
            rateAsset: ChainlinkRateAsset.ETH
        });
        corePrimitives[5] = CorePrimitiveInput({
            symbol: "DAI",
            assetAddress: ETHEREUM_DAI,
            aggregatorAddress: ETHEREUM_DAI_ETH_AGGREGATOR,
            rateAsset: ChainlinkRateAsset.ETH
        });

        __addCorePrimitives(corePrimitives);
    }

    function setUpPolygonEnvironment(uint256 _forkBlock) internal {
        vm.createSelectFork("polygon", _forkBlock);

        v4ReleaseContracts = getV4PolygonReleaseContracts();

        ReleaseConfig memory config = getDefaultPolygonConfig();

        __setUpEnvironment({_config: config, _persistentContractsAlreadySet: false});

        // Deploy minimal asset universe

        // Treat WETH specially and directly add to coreTokens storage (does not require an aggregator)
        symbolToCoreToken["WETH"] = IERC20(wethToken);
        tokenToIsCore[IERC20(wethToken)] = true;

        address simulatedUsdAddress = address(deployUsdEthSimulatedAggregator(config.chainlinkEthUsdAggregatorAddress));

        CorePrimitiveInput[] memory corePrimitives = new CorePrimitiveInput[](5);
        // System primitives
        corePrimitives[0] = CorePrimitiveInput({
            symbol: "WMATIC",
            assetAddress: POLYGON_WMATIC,
            aggregatorAddress: POLYGON_MATIC_USD_AGGREGATOR,
            rateAsset: ChainlinkRateAsset.USD
        });
        corePrimitives[1] = CorePrimitiveInput({
            symbol: "MLN",
            assetAddress: POLYGON_MLN,
            aggregatorAddress: POLYGON_MLN_ETH_AGGREGATOR,
            rateAsset: ChainlinkRateAsset.ETH
        });
        // Extra primitives
        corePrimitives[2] = CorePrimitiveInput({
            symbol: "USD",
            assetAddress: simulatedUsdAddress,
            aggregatorAddress: simulatedUsdAddress,
            rateAsset: ChainlinkRateAsset.ETH
        });
        corePrimitives[3] = CorePrimitiveInput({
            symbol: "USDC",
            assetAddress: POLYGON_USDC,
            aggregatorAddress: POLYGON_USDC_USD_AGGREGATOR,
            rateAsset: ChainlinkRateAsset.USD
        });
        corePrimitives[4] = CorePrimitiveInput({
            symbol: "WBTC",
            assetAddress: POLYGON_WBTC,
            aggregatorAddress: POLYGON_WBTC_USD_AGGREGATOR,
            rateAsset: ChainlinkRateAsset.USD
        });

        __addCorePrimitives(corePrimitives);
    }

    function setUpGoerliEnvironment(uint256 _forkBlock) internal {
        vm.createSelectFork("goerli", _forkBlock);

        ReleaseConfig memory config = ReleaseConfig({
            // Chainlink
            chainlinkEthUsdAggregatorAddress: address(0), // TODO: lookup real address
            chainlinkStaleRateThreshold: 3650 days,
            // Tokens
            mlnTokenAddress: GOERLI_MLN, // TODO: is this actually what we use as "MLN" on Goerli?
            wethTokenAddress: GOERLI_WETH,
            wrappedNativeTokenAddress: GOERLI_WETH,
            // Gas relayer
            gasRelayDepositCooldown: 1 days,
            gasRelayDepositMaxTotal: 1 ether,
            gasRelayFeeMaxPercent: 10,
            gasRelayHubAddress: address(0), // TODO: lookup real address
            gasRelayRelayFeeMaxBase: 0,
            gasRelayTrustedForwarderAddress: address(0), // TODO: lookup/deploy real address
            // Vault settings
            vaultMlnBurner: address(0), // TODO: MLN must be burnable
            vaultPositionsLimit: 20
        });

        __setUpEnvironment({_config: config, _persistentContractsAlreadySet: false});

        // Deploy minimal asset universe

        // Treat WETH specially and directly add to coreTokens storage (does not require an aggregator)
        symbolToCoreToken["WETH"] = IERC20(wethToken);
        tokenToIsCore[IERC20(wethToken)] = true;

        CorePrimitiveInput[] memory corePrimitives = new CorePrimitiveInput[](1);
        // System primitives
        address testMlnEthAggregator = address(createTestAggregator({_price: 0.01 ether}));
        corePrimitives[0] = CorePrimitiveInput({
            symbol: "MLN",
            assetAddress: GOERLI_MLN,
            aggregatorAddress: testMlnEthAggregator,
            rateAsset: ChainlinkRateAsset.ETH
        });

        __addCorePrimitives(corePrimitives);
    }

    function setUpStandaloneEnvironment() internal {
        // Warp beyond Chainlink aggregator staleness threshold
        uint256 chainlinkStaleRateThreshold = 3650 days;
        skip(chainlinkStaleRateThreshold);

        // Deploy mock Chainlink ETH-USD aggregator with arbitrary price
        address chainlinkEthUsdAggregatorAddress =
            address(createTestAggregator({_price: 2222 * CHAINLINK_AGGREGATOR_PRECISION_USD}));

        // Deploy mocks for core tokens
        address wethTokenAddress = address(createTestToken({_name: "Wrapped Ether", _symbol: "WETH", _decimals: 18}));
        address mlnTokenAddress = address(createTestToken({_name: "Enzyme", _symbol: "MLN", _decimals: 18}));
        address wrappedNativeTokenAddress =
            address(createTestToken({_name: "Wrapped Native Asset", _symbol: "wNATIVE", _decimals: 18}));

        __setUpEnvironment({
            _config: ReleaseConfig({
                // Chainlink
                chainlinkEthUsdAggregatorAddress: chainlinkEthUsdAggregatorAddress,
                chainlinkStaleRateThreshold: chainlinkStaleRateThreshold,
                // Tokens
                mlnTokenAddress: mlnTokenAddress,
                wethTokenAddress: wethTokenAddress,
                wrappedNativeTokenAddress: wrappedNativeTokenAddress,
                // Gas relayer
                gasRelayDepositCooldown: 1 days,
                gasRelayDepositMaxTotal: 1 ether,
                gasRelayFeeMaxPercent: 10,
                gasRelayHubAddress: makeAddr("GasRelayHub"), // TODO: Deploy a mock
                gasRelayRelayFeeMaxBase: 0,
                gasRelayTrustedForwarderAddress: makeAddr("GasRelayTrustedForwarder"), // TODO: Deploy a mock
                // Vault settings
                vaultMlnBurner: makeAddr("VaultMlnBurner"), // TODO: Deploy a mock
                vaultPositionsLimit: 20
            }),
            _persistentContractsAlreadySet: false
        });

        // Deploy minimal asset universe

        // Treat WETH specially and directly add to coreTokens storage (does not require an aggregator)
        symbolToCoreToken["WETH"] = IERC20(wethTokenAddress);
        tokenToIsCore[IERC20(wethTokenAddress)] = true;

        // Create missing aggregators for corePrimitives
        address chainlinkMlnEthAggregator =
            address(createTestAggregator({_price: CHAINLINK_AGGREGATOR_PRECISION_ETH / 100}));

        address simulatedUsdAddress = address(deployUsdEthSimulatedAggregator(chainlinkEthUsdAggregatorAddress));

        CorePrimitiveInput[] memory corePrimitives = new CorePrimitiveInput[](2);
        // System primitives
        corePrimitives[0] = CorePrimitiveInput({
            symbol: "MLN",
            assetAddress: mlnTokenAddress,
            aggregatorAddress: chainlinkMlnEthAggregator,
            rateAsset: ChainlinkRateAsset.ETH
        });
        // Extra primitives
        corePrimitives[1] = CorePrimitiveInput({
            symbol: "USD",
            assetAddress: simulatedUsdAddress,
            aggregatorAddress: simulatedUsdAddress,
            rateAsset: ChainlinkRateAsset.ETH
        });

        __addCorePrimitives(corePrimitives);
    }

    function __setUpEnvironment(ReleaseConfig memory _config, bool _persistentContractsAlreadySet) private {
        mlnToken = IERC20(_config.mlnTokenAddress);
        wethToken = IERC20(_config.wethTokenAddress);
        wrappedNativeToken = IERC20(_config.wrappedNativeTokenAddress);

        vm.label(_config.mlnTokenAddress, "MLN");
        vm.label(_config.wethTokenAddress, "WETH");

        if (_config.wethTokenAddress != _config.wrappedNativeTokenAddress) {
            vm.label(_config.wrappedNativeTokenAddress, "WrappedNativeToken");
        }

        if (!_persistentContractsAlreadySet) {
            // Deploy persistent contracts
            core.persistent = deployPersistentCore();

            // Change the Dispatcher owner to an account other than the original deployer
            address dispatcherOwner = core.persistent.dispatcher.getOwner();
            address nextDispatcherOwner = makeAddr("__setUpEnvironment: DispatcherOwner");
            vm.prank(dispatcherOwner);
            core.persistent.dispatcher.setNominatedOwner(nextDispatcherOwner);
            vm.prank(nextDispatcherOwner);
            core.persistent.dispatcher.claimOwnership();
        }

        // Deploy release contracts and post-deployment setup
        core.lastReleaseConfig = _config;
        core.release = deployReleaseCore({_config: _config, _persistentContracts: core.persistent});

        // Add a couple generic tokens
        standardPrimitive = createRegisteredPrimitive(core.release.valueInterpreter, 18);
        nonStandardPrimitive = createRegisteredPrimitive(core.release.valueInterpreter, 8);
    }

    // DEFAULT CONFIG

    function getDefaultMainnetConfig() internal pure returns (ReleaseConfig memory) {
        return ReleaseConfig({
            // Chainlink
            chainlinkEthUsdAggregatorAddress: ETHEREUM_ETH_USD_AGGREGATOR,
            chainlinkStaleRateThreshold: 3650 days,
            // Tokens
            mlnTokenAddress: ETHEREUM_MLN,
            wethTokenAddress: ETHEREUM_WETH,
            wrappedNativeTokenAddress: ETHEREUM_WETH,
            // Gas relayer
            gasRelayDepositCooldown: 1 days,
            gasRelayDepositMaxTotal: 1 ether,
            gasRelayFeeMaxPercent: 10,
            gasRelayHubAddress: 0x9e59Ea5333cD4f402dAc320a04fafA023fe3810D,
            gasRelayRelayFeeMaxBase: 0,
            gasRelayTrustedForwarderAddress: 0xca57e5D6218AeB093D76372B51Ba355CfB3C6Cd0,
            // Vault settings
            vaultMlnBurner: address(0),
            vaultPositionsLimit: 20
        });
    }

    function getDefaultPolygonConfig() internal returns (ReleaseConfig memory) {
        address mlnBurner = makeAddr("MlnBurner");

        return ReleaseConfig({
            // Chainlink
            chainlinkEthUsdAggregatorAddress: POLYGON_ETH_USD_AGGREGATOR,
            chainlinkStaleRateThreshold: 3650 days,
            // Tokens
            mlnTokenAddress: POLYGON_MLN,
            wethTokenAddress: POLYGON_WETH,
            wrappedNativeTokenAddress: POLYGON_WMATIC,
            // Gas relayer
            gasRelayDepositCooldown: 1 days,
            gasRelayDepositMaxTotal: 1 ether,
            gasRelayFeeMaxPercent: 10,
            gasRelayHubAddress: address(0), // TODO: lookup real value
            gasRelayRelayFeeMaxBase: 0,
            gasRelayTrustedForwarderAddress: address(0), // TODO: lookup real value
            // Vault settings
            vaultMlnBurner: mlnBurner,
            vaultPositionsLimit: 20
        });
    }

    // ASSET UNIVERSE

    /// @dev Keep private to avoid accidental use
    function __addCorePrimitives(CorePrimitiveInput[] memory _primitives) private {
        for (uint256 i; i < _primitives.length; i++) {
            CorePrimitiveInput memory primitiveInfo = _primitives[i];
            IERC20 token = IERC20(primitiveInfo.assetAddress);
            string memory symbol = primitiveInfo.symbol;
            address aggregatorAddress = primitiveInfo.aggregatorAddress;
            ChainlinkRateAsset rateAsset = primitiveInfo.rateAsset;

            // Register primitive.
            // Don't allow overwriting.
            addPrimitive({
                _valueInterpreter: core.release.valueInterpreter,
                _tokenAddress: address(token),
                _aggregatorAddress: aggregatorAddress,
                _rateAsset: rateAsset,
                _skipIfRegistered: false
            });

            // Add to list of registered primitives
            symbolToCoreToken[symbol] = token;
            tokenToIsCore[token] = true;
        }
    }

    function getCoreToken(string memory _symbol) internal view returns (IERC20 token_) {
        token_ = symbolToCoreToken[_symbol];
        require(isCoreToken(token_), "getCoreToken: Not registered");

        return token_;
    }

    function isCoreToken(IERC20 _token) internal view returns (bool isCore_) {
        return tokenToIsCore[_token];
    }

    // VERSIONED CONVENIENCE FUNCTIONS
    // Not the most ideal place to dump all this stuff, but it's convenient for now

    // Sorted descending, so default is most current version in the repo.
    // V3 and earlier not supported.
    // Version numbers refer to live contracts, not the contracts in this repo.
    enum EnzymeVersion {
        Current,
        V4
    }

    // Versioned routers

    function adapterActionForVersion(
        EnzymeVersion _version,
        address _comptrollerProxyAddress,
        address _adapterAddress,
        bytes4 _selector,
        bytes memory _actionArgs
    ) internal {
        // Only difference currently is the integration manager address
        address integrationManagerAddress = getIntegrationManagerAddressForVersion(_version);

        callOnIntegration({
            _integrationManager: IIntegrationManager(integrationManagerAddress),
            _comptrollerProxy: IComptrollerLib(_comptrollerProxyAddress),
            _adapter: _adapterAddress,
            _selector: _selector,
            _actionArgs: _actionArgs
        });
    }

    function createTradingFundForVersion(EnzymeVersion _version)
        internal
        returns (address comptrollerProxyAddress_, address vaultProxyAddress_, address fundOwner_)
    {
        // Use arbitrary test token as denomination asset
        IERC20 denominationAsset = createTestToken();

        if (_version == EnzymeVersion.V4) {
            // Add the denom asset as primitive
            v4AddPrimitiveWithTestAggregator({_tokenAddress: address(denominationAsset), _skipIfRegistered: false});

            return v4CreateFundSimple({
                _fundDeployer: v4ReleaseContracts.fundDeployer,
                _denominationAsset: denominationAsset
            });
        } else {
            // Add the denom asset as primitive
            addPrimitiveWithTestAggregator({
                _valueInterpreter: core.release.valueInterpreter,
                _tokenAddress: address(denominationAsset),
                _skipIfRegistered: false
            });

            IFundDeployer.ConfigInput memory comptrollerConfig;
            comptrollerConfig.denominationAsset = address(denominationAsset);

            IComptrollerLib comptrollerProxy;
            IVaultLib vaultProxy;
            (comptrollerProxy, vaultProxy, fundOwner_) =
                createFund({_fundDeployer: core.release.fundDeployer, _comptrollerConfig: comptrollerConfig});

            comptrollerProxyAddress_ = address(comptrollerProxy);
            vaultProxyAddress_ = address(vaultProxy);
        }
    }

    function getIntegrationManagerAddressForVersion(EnzymeVersion _version)
        internal
        view
        returns (address integrationManagerAddress_)
    {
        if (_version == EnzymeVersion.V4) {
            return address(v4ReleaseContracts.integrationManager);
        } else {
            return address(core.release.integrationManager);
        }
    }

    // v4 actions: fund creation

    // Create simple fund that can trade, but no fees or policies
    function v4CreateFundSimple(IV4FundDeployer _fundDeployer, IERC20 _denominationAsset)
        internal
        returns (address comptrollerProxyAddress_, address vaultProxyAddress_, address fundOwner_)
    {
        fundOwner_ = makeAddr("createFund: FundOwner");

        (comptrollerProxyAddress_, vaultProxyAddress_) = _fundDeployer.createNewFund({
            _fundOwner: fundOwner_,
            _fundName: "Test Fund",
            _fundSymbol: "TEST",
            _denominationAsset: address(_denominationAsset),
            _sharesActionTimelock: 0,
            _feeManagerConfigData: "",
            _policyManagerConfigData: ""
        });
    }

    // v4 actions: system

    // Where the interfaces/logic remain the same, we can reuse the current convenience functions for v4 (e.g., ValueInterpreter).
    // By defining pass-through helpers in such a way, we can avoid more heavy refactoring later if we can no longer use the current convenience functions

    function v4AddPrimitiveWithTestAggregator(address _tokenAddress, bool _skipIfRegistered)
        internal
        returns (TestAggregator aggregator_)
    {
        return addPrimitiveWithTestAggregator({
            _valueInterpreter: IValueInterpreter(address(v4ReleaseContracts.valueInterpreter)),
            _tokenAddress: _tokenAddress,
            _skipIfRegistered: _skipIfRegistered
        });
    }
}
