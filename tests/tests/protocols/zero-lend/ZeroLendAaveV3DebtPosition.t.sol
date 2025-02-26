// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IAaveV3PoolAddressProvider} from "tests/interfaces/external/IAaveV3PoolAddressProvider.sol";
import {IAaveV3ProtocolDataProvider} from "tests/interfaces/external/IAaveV3ProtocolDataProvider.sol";
import {IAaveV3RewardsController} from "tests/interfaces/external/IAaveV3RewardsController.sol";
import {IMerklDistributor} from "tests/interfaces/external/IMerklDistributor.sol";
import {IERC20} from "tests/interfaces/external/IERC20.sol";

import {AaveV3DebtPositionTestBase} from "../aave/AaveV3DebtPositionTest.sol";

import {
    ETHEREUM_ZERO_LEND_LRT_BTC_AAVE_V3_POOL_ADDRESS_PROVIDER,
    ETHEREUM_ZERO_LEND_LRT_BTC_AAVE_V3_PROTOCOL_DATA_PROVIDER,
    ETHEREUM_ZERO_LEND_LRT_BTC_AAVE_V3_REWARDS_CONTROLLER,
    ETHEREUM_ZERO_LEND_RWA_STABLECOINS_AAVE_V3_POOL_ADDRESS_PROVIDER,
    ETHEREUM_ZERO_LEND_RWA_STABLECOINS_AAVE_V3_PROTOCOL_DATA_PROVIDER,
    ETHEREUM_ZERO_LEND_RWA_STABLECOINS_AAVE_V3_REWARDS_CONTROLLER
} from "./ZeroLendConstants.sol";

abstract contract ZeroLendLRTBTCAaveV3DebtPositionTestBaseEthereum is AaveV3DebtPositionTestBase {
    function __initialize(EnzymeVersion _version) internal {
        __initialize({
            _version: _version,
            _chainId: ETHEREUM_CHAIN_ID,
            _merklDistributor: IMerklDistributor(ETHEREUM_MERKL_DISTRIBUTOR),
            _poolAddressProvider: IAaveV3PoolAddressProvider(ETHEREUM_ZERO_LEND_LRT_BTC_AAVE_V3_POOL_ADDRESS_PROVIDER),
            _protocolDataProvider: IAaveV3ProtocolDataProvider(ETHEREUM_ZERO_LEND_LRT_BTC_AAVE_V3_PROTOCOL_DATA_PROVIDER),
            _rewardsController: IAaveV3RewardsController(ETHEREUM_ZERO_LEND_LRT_BTC_AAVE_V3_REWARDS_CONTROLLER),
            _collateralUnderlyingAddresses: toArray(ETHEREUM_WBTC, ETHEREUM_CBBTC, ETHEREUM_EBTC, ETHEREUM_LBTC),
            _borrowableUnderlyingAddresses: toArray(ETHEREUM_EBTC, ETHEREUM_WBTC),
            _rewardedCollateralUnderlyingAddress: ETHEREUM_WBTC
        });
    }
}

abstract contract ZeroLendRWAStablecoinsAaveV3DebtPositionTestBaseEthereum is AaveV3DebtPositionTestBase {
    function __initialize(EnzymeVersion _version) internal {
        __initialize({
            _version: _version,
            _chainId: ETHEREUM_CHAIN_ID,
            _merklDistributor: IMerklDistributor(ETHEREUM_MERKL_DISTRIBUTOR),
            _poolAddressProvider: IAaveV3PoolAddressProvider(
                ETHEREUM_ZERO_LEND_RWA_STABLECOINS_AAVE_V3_POOL_ADDRESS_PROVIDER
            ),
            _protocolDataProvider: IAaveV3ProtocolDataProvider(
                ETHEREUM_ZERO_LEND_RWA_STABLECOINS_AAVE_V3_PROTOCOL_DATA_PROVIDER
            ),
            _rewardsController: IAaveV3RewardsController(ETHEREUM_ZERO_LEND_RWA_STABLECOINS_AAVE_V3_REWARDS_CONTROLLER),
            _collateralUnderlyingAddresses: toArray(ETHEREUM_USDT, ETHEREUM_USDC, ETHEREUM_USDS, ETHEREUM_USDE),
            _borrowableUnderlyingAddresses: toArray(ETHEREUM_USDC, ETHEREUM_USDT),
            _rewardedCollateralUnderlyingAddress: ETHEREUM_USDC
        });
    }
}

contract ZeroLendLRTBTCAaveV3DebtPositionTestEthereum is ZeroLendLRTBTCAaveV3DebtPositionTestBaseEthereum {
    function setUp() public override {
        __initialize(EnzymeVersion.Current);
    }
}

contract ZeroLendLRTBTCAaveV3DebtPositionTestEthereumV4 is ZeroLendLRTBTCAaveV3DebtPositionTestBaseEthereum {
    function setUp() public override {
        __initialize(EnzymeVersion.V4);
    }
}

contract ZeroLendRWAStablecoinsAaveV3DebtPositionTestEthereum is
    ZeroLendRWAStablecoinsAaveV3DebtPositionTestBaseEthereum
{
    function setUp() public override {
        __initialize(EnzymeVersion.Current);
    }
}

contract ZeroLendRWAStablecoinsAaveV3DebtPositionTestEthereumV4 is
    ZeroLendRWAStablecoinsAaveV3DebtPositionTestBaseEthereum
{
    function setUp() public override {
        __initialize(EnzymeVersion.V4);
    }
}
