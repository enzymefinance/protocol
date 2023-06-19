// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {CoreUtils} from "tests/utils/CoreUtils.sol";
import {ChainlinkRateAsset} from "tests/utils/core/AssetUniverseUtils.sol";
import {ICoreDeployment} from "tests/utils/core/DeploymentUtils.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";

struct CorePrimitiveInput {
    string symbol;
    address assetAddress;
    address aggregatorAddress;
    ChainlinkRateAsset rateAsset;
}

abstract contract IntegrationTest is CoreUtils {
    IERC20 internal mlnToken;
    IERC20 internal wethToken;
    IERC20 internal wrappedNativeToken;

    IERC20 internal standardPrimitive;
    IERC20 internal nonStandardPrimitive;

    ICoreDeployment.Deployment internal core;
    // Don't allow access outside of this contract
    mapping(string => IERC20) private symbolToCoreToken;
    mapping(IERC20 => bool) private tokenToIsCore;

    function setUp() public virtual {
        setUpStandaloneEnvironment();
    }

    function setUpMainnetEnvironment() internal {
        setUpMainnetEnvironment(ETHEREUM_BLOCK_LATEST, true);
    }

    function setUpMainnetEnvironment(uint256 _forkBlock) internal {
        setUpMainnetEnvironment(_forkBlock, true);
    }

    function setUpPolygonEnvironment() internal {
        setUpPolygonEnvironment(POLYGON_BLOCK_LATEST, true);
    }

    function setUpPolygonEnvironment(uint256 _forkBlock) internal {
        setUpPolygonEnvironment(_forkBlock, true);
    }

    function setUpStandaloneEnvironment() internal {
        setUpStandaloneEnvironment(true);
    }

    function setUpMainnetEnvironment(uint256 _forkBlock, bool _setReleaseLive) internal {
        vm.createSelectFork("mainnet", _forkBlock);

        setUpEnvironment({
            _setReleaseLive: _setReleaseLive,
            _wethToken: ETHEREUM_WETH,
            _mlnToken: ETHEREUM_MLN,
            _wrappedNativeToken: ETHEREUM_WETH,
            _gasRelayHub: 0x9e59Ea5333cD4f402dAc320a04fafA023fe3810D,
            _gasRelayTrustedForwarder: 0xca57e5D6218AeB093D76372B51Ba355CfB3C6Cd0,
            _gasRelayDepositCooldown: 1 days,
            _gasRelayDepositMaxTotal: 1 ether,
            _gasRelayRelayFeeMaxBase: 0,
            _gasRelayFeeMaxPercent: 10,
            _vaultMlnBurner: address(0), // TODO: This requires per-network config
            _vaultPositionsLimit: 20,
            _chainlinkStaleRateThreshold: 3650 days,
            _ethUsdAggregator: ETHEREUM_ETH_USD_AGGREGATOR
        });

        // Deploy minimal asset universe

        // Treat WETH specially and directly add to coreTokens storage (does not require an aggregator)
        symbolToCoreToken["WETH"] = IERC20(wethToken);
        tokenToIsCore[IERC20(wethToken)] = true;

        address simulatedUsdAddress = address(deployUsdEthSimulatedAggregator(core.config.ethUsdAggregator));

        CorePrimitiveInput[] memory corePrimitives = new CorePrimitiveInput[](4);
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

        addCorePrimitives(corePrimitives);
    }

    function setUpPolygonEnvironment(uint256 _forkBlock, bool _setReleaseLive) internal {
        vm.createSelectFork("polygon", _forkBlock);

        setUpEnvironment({
            _setReleaseLive: _setReleaseLive,
            _wethToken: POLYGON_WETH,
            _mlnToken: POLYGON_MLN,
            _wrappedNativeToken: POLYGON_WMATIC,
            _gasRelayHub: address(0),
            _gasRelayTrustedForwarder: address(0),
            _gasRelayDepositCooldown: 1 days,
            _gasRelayDepositMaxTotal: 1 ether,
            _gasRelayRelayFeeMaxBase: 0,
            _gasRelayFeeMaxPercent: 10,
            _vaultMlnBurner: address(0), // TODO: This requires per-network config
            _vaultPositionsLimit: 20,
            _chainlinkStaleRateThreshold: 3650 days,
            _ethUsdAggregator: POLYGON_ETH_USD_AGGREGATOR
        });

        // Deploy minimal asset universe

        // Treat WETH specially and directly add to coreTokens storage (does not require an aggregator)
        symbolToCoreToken["WETH"] = IERC20(wethToken);
        tokenToIsCore[IERC20(wethToken)] = true;

        address simulatedUsdAddress = address(deployUsdEthSimulatedAggregator(core.config.ethUsdAggregator));

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

        addCorePrimitives(corePrimitives);
    }

    function setUpStandaloneEnvironment(bool _setReleaseLive) internal {
        // Warp beyond Chainlink aggregator staleness threshold
        skip(3650 days);

        setUpEnvironment({
            _setReleaseLive: _setReleaseLive,
            _wethToken: makeAddr("WethToken"), // TODO: Deploy a mock
            _mlnToken: makeAddr("MlnToken"), // TODO: Deploy a mock
            _wrappedNativeToken: makeAddr("WrappedNativeToken"), // TODO: Deploy a mock
            _gasRelayHub: makeAddr("GasRelayHub"), // TODO: Deploy a mock
            _gasRelayTrustedForwarder: makeAddr("GasRelayTrustedForwarder"), // TODO: Deploy a mock
            _gasRelayDepositCooldown: 1 days,
            _gasRelayDepositMaxTotal: 1 ether,
            _gasRelayRelayFeeMaxBase: 0,
            _gasRelayFeeMaxPercent: 10,
            _vaultMlnBurner: makeAddr("VaultMlnBurner"), // TODO: Deploy a mock
            _vaultPositionsLimit: 20,
            _chainlinkStaleRateThreshold: 3650 days,
            _ethUsdAggregator: address(0) // TODO: Deploy a mock
        });
    }

    function setUpEnvironment(
        bool _setReleaseLive,
        address _wethToken,
        address _mlnToken,
        address _wrappedNativeToken,
        address _gasRelayHub,
        address _gasRelayTrustedForwarder,
        uint256 _gasRelayDepositCooldown,
        uint256 _gasRelayDepositMaxTotal,
        uint256 _gasRelayRelayFeeMaxBase,
        uint256 _gasRelayFeeMaxPercent,
        address _vaultMlnBurner,
        uint256 _vaultPositionsLimit,
        uint256 _chainlinkStaleRateThreshold,
        address _ethUsdAggregator
    ) private {
        mlnToken = IERC20(_mlnToken);
        wethToken = IERC20(_wethToken);
        wrappedNativeToken = IERC20(_wrappedNativeToken);

        vm.label(_mlnToken, "MLN");
        vm.label(_wethToken, "WETH");

        if (_wethToken != _wrappedNativeToken) {
            vm.label(_wrappedNativeToken, "WrappedNativeToken");
        }

        core = deployRelease({
            _wethToken: wethToken,
            _mlnToken: mlnToken,
            _wrappedNativeToken: wrappedNativeToken,
            _gasRelayHub: _gasRelayHub,
            _gasRelayTrustedForwarder: _gasRelayTrustedForwarder,
            _gasRelayDepositCooldown: _gasRelayDepositCooldown,
            _gasRelayDepositMaxTotal: _gasRelayDepositMaxTotal,
            _gasRelayRelayFeeMaxBase: _gasRelayRelayFeeMaxBase,
            _gasRelayFeeMaxPercent: _gasRelayFeeMaxPercent,
            _vaultMlnBurner: _vaultMlnBurner,
            _vaultPositionsLimit: _vaultPositionsLimit,
            _chainlinkStaleRateThreshold: _chainlinkStaleRateThreshold,
            _ethUsdAggregator: _ethUsdAggregator
        });

        if (_setReleaseLive) {
            setReleaseLive(core);
        }

        standardPrimitive = createRegisteredPrimitive(core.release.valueInterpreter, 18);
        nonStandardPrimitive = createRegisteredPrimitive(core.release.valueInterpreter, 8);
    }

    // ASSET UNIVERSE

    /// @dev Keep private to avoid accidental use
    function addCorePrimitives(CorePrimitiveInput[] memory _primitives) private {
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
}
