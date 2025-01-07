// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IERC20} from "tests/interfaces/external/IERC20.sol";

import {AaveV3AdapterTest} from "../aave/AaveV3AdapterTest.sol";
import {
    ETHEREUM_ZERO_LEND_LRT_BTC_AAVE_V3_POOL,
    ETHEREUM_ZERO_LEND_LRT_BTC_AAVE_V3_POOL_ADDRESS_PROVIDER,
    ETHEREUM_ZERO_LEND_RWA_STABLECOINS_AAVE_V3_POOL,
    ETHEREUM_ZERO_LEND_RWA_STABLECOINS_AAVE_V3_POOL_ADDRESS_PROVIDER
} from "./ZeroLendConstants.sol";

abstract contract ZeroLendLRTBTCAaveV3AdapterTestEthereumBase is AaveV3AdapterTest {
    function __initialize(EnzymeVersion _version) internal {
        __initializeAaveV3AdapterTest({
            _version: _version,
            _chainId: ETHEREUM_CHAIN_ID,
            _lendingPool: ETHEREUM_ZERO_LEND_LRT_BTC_AAVE_V3_POOL,
            _lendingPoolAddressProvider: ETHEREUM_ZERO_LEND_LRT_BTC_AAVE_V3_POOL_ADDRESS_PROVIDER,
            _regular18DecimalUnderlying: IERC20(ETHEREUM_MBTC),
            _non18DecimalUnderlying: IERC20(ETHEREUM_WBTC)
        });
    }
}

abstract contract ZeroLendRWAStablecoinsAaveV3AdapterTestEthereumBase is AaveV3AdapterTest {
    function __initialize(EnzymeVersion _version) internal {
        __initializeAaveV3AdapterTest({
            _version: _version,
            _chainId: ETHEREUM_CHAIN_ID,
            _lendingPool: ETHEREUM_ZERO_LEND_RWA_STABLECOINS_AAVE_V3_POOL,
            _lendingPoolAddressProvider: ETHEREUM_ZERO_LEND_RWA_STABLECOINS_AAVE_V3_POOL_ADDRESS_PROVIDER,
            _regular18DecimalUnderlying: IERC20(ETHEREUM_USDE),
            _non18DecimalUnderlying: IERC20(ETHEREUM_USDC)
        });
    }
}

contract ZeroLendLRTBTCAaveV3AdapterTestEthereum is ZeroLendLRTBTCAaveV3AdapterTestEthereumBase {
    function setUp() public override {
        __initialize(EnzymeVersion.Current);
    }
}

contract ZeroLendLRTBTCAaveV3AdapterTestEthereumV4 is ZeroLendLRTBTCAaveV3AdapterTestEthereumBase {
    function setUp() public override {
        __initialize(EnzymeVersion.V4);
    }
}

contract ZeroLendRWAStablecoinsAaveV3AdapterTestEthereum is ZeroLendRWAStablecoinsAaveV3AdapterTestEthereumBase {
    function setUp() public override {
        __initialize(EnzymeVersion.Current);
    }
}

contract ZeroLendRWAStablecoinsAaveV3AdapterTestEthereumV4 is ZeroLendRWAStablecoinsAaveV3AdapterTestEthereumBase {
    function setUp() public override {
        __initialize(EnzymeVersion.V4);
    }
}
