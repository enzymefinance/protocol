// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {IERC20} from "tests/interfaces/external/IERC20.sol";
import {
    ETHEREUM_POOL_ADDRESS,
    ETHEREUM_POOL_ADDRESS_PROVIDER,
    POLYGON_POOL_ADDRESS,
    POLYGON_POOL_ADDRESS_PROVIDER,
    ARBITRUM_POOL_ADDRESS,
    ARBITRUM_POOL_ADDRESS_PROVIDER,
    BASE_POOL_ADDRESS,
    BASE_POOL_ADDRESS_PROVIDER
} from "./AaveV3Constants.sol";
import {AaveV3AdapterTest} from "./AaveV3AdapterTest.sol";

abstract contract AaveV3AdapterTestEthereumBase is AaveV3AdapterTest {
    function __initialize() internal {
        __initializeAaveV3AdapterTest({
            _chainId: ETHEREUM_CHAIN_ID,
            _lendingPool: ETHEREUM_POOL_ADDRESS,
            _lendingPoolAddressProvider: ETHEREUM_POOL_ADDRESS_PROVIDER,
            _regular18DecimalUnderlying: IERC20(ETHEREUM_WETH),
            _non18DecimalUnderlying: IERC20(ETHEREUM_USDC)
        });
    }
}

abstract contract AaveV3AdapterTestPolygonBase is AaveV3AdapterTest {
    function __initialize() internal {
        __initializeAaveV3AdapterTest({
            _chainId: POLYGON_CHAIN_ID,
            _lendingPool: POLYGON_POOL_ADDRESS,
            _lendingPoolAddressProvider: POLYGON_POOL_ADDRESS_PROVIDER,
            _regular18DecimalUnderlying: IERC20(POLYGON_WETH),
            _non18DecimalUnderlying: IERC20(POLYGON_USDC)
        });
    }
}

abstract contract AaveV3AdapterTestArbitrumBase is AaveV3AdapterTest {
    function __initialize() internal {
        __initializeAaveV3AdapterTest({
            _chainId: ARBITRUM_CHAIN_ID,
            _lendingPool: ARBITRUM_POOL_ADDRESS,
            _lendingPoolAddressProvider: ARBITRUM_POOL_ADDRESS_PROVIDER,
            _regular18DecimalUnderlying: IERC20(ARBITRUM_WETH),
            _non18DecimalUnderlying: IERC20(ARBITRUM_USDC)
        });
    }
}

abstract contract AaveV3AdapterTestBaseChainBase is AaveV3AdapterTest {
    function __initialize() internal {
        __initializeAaveV3AdapterTest({
            _chainId: BASE_CHAIN_ID,
            _lendingPool: BASE_POOL_ADDRESS,
            _lendingPoolAddressProvider: BASE_POOL_ADDRESS_PROVIDER,
            _regular18DecimalUnderlying: IERC20(BASE_WETH),
            _non18DecimalUnderlying: IERC20(BASE_USDC)
        });
    }
}

contract AaveV3AdapterTestEthereum is AaveV3AdapterTestEthereumBase {
    function setUp() public override {
        __initialize();
    }
}

contract AaveV3AdapterTestPolygon is AaveV3AdapterTestPolygonBase {
    function setUp() public override {
        __initialize();
    }
}
