// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import {Test} from "forge-std/Test.sol";

import {CommonUtils} from "tests/utils/CommonUtils.sol";
import {CoreUtils, ICoreDeployment} from "tests/utils/CoreUtils.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {IWETH} from "tests/interfaces/external/IWETH.sol";

abstract contract IntegrationTest is Test, CoreUtils, CommonUtils {
    IERC20 internal mlnToken;
    IWETH internal wethToken;
    IWETH internal wrappedNativeToken;

    IERC20 internal standardPrimitive;
    IERC20 internal nonStandardPrimitive;

    ICoreDeployment.Deployment internal core;

    function setUp() public virtual {
        setUpStandaloneEnvironment();
    }

    function setUpMainnetEnvironment(uint256 _forkBlock) internal {
        setUpMainnetEnvironment(_forkBlock, true);
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
            _wethToken: 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2,
            _mlnToken: 0xec67005c4E498Ec7f55E092bd1d35cbC47C91892,
            _wrappedNativeToken: 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2,
            _gasRelayHub: 0x9e59Ea5333cD4f402dAc320a04fafA023fe3810D,
            _gasRelayTrustedForwarder: 0xca57e5D6218AeB093D76372B51Ba355CfB3C6Cd0,
            _gasRelayDepositCooldown: 1 days,
            _gasRelayDepositMaxTotal: 1 ether,
            _gasRelayRelayFeeMaxBase: 0,
            _gasRelayFeeMaxPercent: 10,
            _vaultMlnBurner: address(0), // TODO: This requires per-network config
            _vaultPositionsLimit: 20,
            _chainlinkStaleRateThreshold: 3650 days,
            _ethUsdAggregator: 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419
        });
    }

    function setUpPolygonEnvironment(uint256 _forkBlock, bool _setReleaseLive) internal {
        vm.createSelectFork("polygon", _forkBlock);

        setUpEnvironment({
            _setReleaseLive: _setReleaseLive,
            _wethToken: 0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619,
            _mlnToken: 0xa9f37D84c856fDa3812ad0519Dad44FA0a3Fe207,
            _wrappedNativeToken: 0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270,
            _gasRelayHub: address(0),
            _gasRelayTrustedForwarder: address(0),
            _gasRelayDepositCooldown: 1 days,
            _gasRelayDepositMaxTotal: 1 ether,
            _gasRelayRelayFeeMaxBase: 0,
            _gasRelayFeeMaxPercent: 10,
            _vaultMlnBurner: address(0), // TODO: This requires per-network config
            _vaultPositionsLimit: 20,
            _chainlinkStaleRateThreshold: 3650 days,
            _ethUsdAggregator: 0xF9680D99D6C9589e2a93a78A04A279e509205945
        });
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
        wethToken = IWETH(_wethToken);
        wrappedNativeToken = IWETH(_wrappedNativeToken);

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
}
