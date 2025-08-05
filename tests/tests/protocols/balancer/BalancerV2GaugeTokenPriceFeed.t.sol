// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IBalancerV2LiquidityGauge} from "tests/interfaces/external/IBalancerV2LiquidityGauge.sol";
import {IERC20} from "tests/interfaces/external/IERC20.sol";

import {IBalancerV2GaugeTokenPriceFeed} from "tests/interfaces/internal/IBalancerV2GaugeTokenPriceFeed.sol";

import {BalancerV2Utils} from "./BalancerV2Utils.sol";

abstract contract BalancerV2GaugeTokenPriceFeedTestBase is BalancerV2Utils, IntegrationTest {
    IBalancerV2GaugeTokenPriceFeed internal priceFeed;

    function __initialize(uint256 _chainId) internal {
        setUpNetworkEnvironment(_chainId);
        priceFeed = __deployPriceFeed();
    }

    // DEPLOYMENT HELPERS

    function __deployPriceFeed() private returns (IBalancerV2GaugeTokenPriceFeed priceFeed_) {
        address addr = deployCode("BalancerV2GaugeTokenPriceFeed.sol");
        return IBalancerV2GaugeTokenPriceFeed(addr);
    }

    // TESTS

    function __test_calcUnderlyingValues_success(address _derivative, address _lpToken) internal {
        uint256 derivativeAmount = assetUnit(IERC20(_derivative)) * 3;

        (address[] memory underlyingAddresses, uint256[] memory underlyingValues) =
            priceFeed.calcUnderlyingValues({_derivative: _derivative, _derivativeAmount: derivativeAmount});

        assertEq(toArray(derivativeAmount), underlyingValues, "Mismatch between actual and expected underlying value");
        assertEq(toArray(_lpToken), underlyingAddresses, "Mismatch between actual and expected underlying address");
    }

    function __test_isSupportedAsset_success(address _gauge) internal {
        assertTrue(priceFeed.isSupportedAsset(_gauge), "Unsupported gauge");
    }
}

abstract contract BalancerV2GaugeTokenPriceFeedTestBaseEthereum is BalancerV2GaugeTokenPriceFeedTestBase {
    function __initialize() internal {
        __initialize({_chainId: ETHEREUM_CHAIN_ID});
    }

    function test_calcUnderlyingValues_success() public {
        __test_calcUnderlyingValues_success({
            _derivative: ETHEREUM_USDC_DAI_USDT_POOL_GAUGE_ADDRESS,
            _lpToken: ETHEREUM_USDC_DAI_USDT_POOL_ADDRESS
        });
    }

    function test_isSupportedAsset_success() public {
        __test_isSupportedAsset_success(ETHEREUM_USDC_DAI_USDT_POOL_GAUGE_ADDRESS);
    }
}

abstract contract BalancerV2GaugeTokenPriceFeedTestBasePolygon is BalancerV2GaugeTokenPriceFeedTestBase {
    function __initialize() internal {
        __initialize({_chainId: POLYGON_CHAIN_ID});
    }

    function test_calcUnderlyingValues_success() public {
        __test_calcUnderlyingValues_success({
            _derivative: POLYGON_TRICRYPTO_POOL_GAUGE_ADDRESS,
            _lpToken: POLYGON_TRICRYPTO_POOL_ADDRESS
        });
    }

    function test_isSupportedAsset_success() public {
        __test_isSupportedAsset_success(POLYGON_TRICRYPTO_POOL_GAUGE_ADDRESS);
    }
}

contract BalancerV2GaugeTokenPriceFeedTestEthereum is BalancerV2GaugeTokenPriceFeedTestBaseEthereum {
    function setUp() public override {
        __initialize();
    }
}

contract BalancerV2GaugeTokenPriceFeedTestEthereumV4 is BalancerV2GaugeTokenPriceFeedTestBaseEthereum {
    function setUp() public override {
        __initialize();
    }
}

contract BalancerV2GaugeTokenPriceFeedTestPolygon is BalancerV2GaugeTokenPriceFeedTestBasePolygon {
    function setUp() public override {
        __initialize();
    }
}

contract BalancerV2GaugeTokenPriceFeedTestPolygonV4 is BalancerV2GaugeTokenPriceFeedTestBasePolygon {
    function setUp() public override {
        __initialize();
    }
}
