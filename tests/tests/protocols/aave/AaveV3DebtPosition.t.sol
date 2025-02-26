// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IAaveV3DebtPosition as IAaveV3DebtPositionProd} from
    "contracts/release/extensions/external-position-manager/external-positions/aave-v3-debt/IAaveV3DebtPosition.sol";

import {IAaveV3PoolAddressProvider} from "tests/interfaces/external/IAaveV3PoolAddressProvider.sol";
import {IAaveV3PriceOracle} from "tests/interfaces/external/IAaveV3PriceOracle.sol";
import {IAaveV3ProtocolDataProvider} from "tests/interfaces/external/IAaveV3ProtocolDataProvider.sol";
import {IAaveV3RewardsController} from "tests/interfaces/external/IAaveV3RewardsController.sol";
import {IMerklDistributor} from "tests/interfaces/external/IMerklDistributor.sol";
import {IERC20} from "tests/interfaces/external/IERC20.sol";

import {
    ETHEREUM_POOL_ADDRESS_PROVIDER,
    ETHEREUM_PROTOCOL_DATA_PROVIDER,
    ETHEREUM_REWARDS_CONTROLLER,
    POLYGON_POOL_ADDRESS_PROVIDER,
    POLYGON_PROTOCOL_DATA_PROVIDER,
    POLYGON_REWARDS_CONTROLLER,
    ARBITRUM_POOL_ADDRESS_PROVIDER,
    ARBITRUM_PROTOCOL_DATA_PROVIDER,
    ARBITRUM_REWARDS_CONTROLLER,
    BASE_POOL_ADDRESS_PROVIDER,
    BASE_PROTOCOL_DATA_PROVIDER,
    BASE_REWARDS_CONTROLLER
} from "./AaveV3Constants.sol";
import {AaveV3DebtPositionTestBase} from "./AaveV3DebtPositionTest.sol";

abstract contract AaveV3DebtPositionTestBaseEthereum is AaveV3DebtPositionTestBase {
    function __initialize(EnzymeVersion _version) internal {
        __initialize({
            _version: _version,
            _chainId: ETHEREUM_CHAIN_ID,
            _merklDistributor: IMerklDistributor(ETHEREUM_MERKL_DISTRIBUTOR),
            _poolAddressProvider: IAaveV3PoolAddressProvider(ETHEREUM_POOL_ADDRESS_PROVIDER),
            _protocolDataProvider: IAaveV3ProtocolDataProvider(ETHEREUM_PROTOCOL_DATA_PROVIDER),
            _rewardsController: IAaveV3RewardsController(ETHEREUM_REWARDS_CONTROLLER),
            _collateralUnderlyingAddresses: toArray(
                ETHEREUM_WBTC, ETHEREUM_WSTETH, ETHEREUM_DAI, ETHEREUM_USDC, ETHEREUM_BAL
            ),
            _borrowableUnderlyingAddresses: toArray(ETHEREUM_USDC, ETHEREUM_WSTETH),
            _rewardedCollateralUnderlyingAddress: ETHEREUM_ETH_X
        });
    }
}

abstract contract AaveV3DebtPositionTestBasePolygon is AaveV3DebtPositionTestBase {
    function __initialize(EnzymeVersion _version) internal {
        __initialize({
            _version: _version,
            _chainId: POLYGON_CHAIN_ID,
            _merklDistributor: IMerklDistributor(POLYGON_MERKL_DISTRIBUTOR),
            _poolAddressProvider: IAaveV3PoolAddressProvider(POLYGON_POOL_ADDRESS_PROVIDER),
            _protocolDataProvider: IAaveV3ProtocolDataProvider(POLYGON_PROTOCOL_DATA_PROVIDER),
            _rewardsController: IAaveV3RewardsController(POLYGON_REWARDS_CONTROLLER),
            _collateralUnderlyingAddresses: toArray(POLYGON_WBTC, POLYGON_LINK, POLYGON_DAI, POLYGON_USDC, POLYGON_USDT),
            _borrowableUnderlyingAddresses: toArray(POLYGON_USDC, POLYGON_LINK),
            _rewardedCollateralUnderlyingAddress: POLYGON_MATIC_X
        });
    }
}

abstract contract AaveV3DebtPositionTestBaseArbitrum is AaveV3DebtPositionTestBase {
    function __initialize(EnzymeVersion _version) internal {
        __initialize({
            _version: _version,
            _chainId: ARBITRUM_CHAIN_ID,
            _merklDistributor: IMerklDistributor(ARBITRUM_MERKL_DISTRIBUTOR),
            _poolAddressProvider: IAaveV3PoolAddressProvider(ARBITRUM_POOL_ADDRESS_PROVIDER),
            _protocolDataProvider: IAaveV3ProtocolDataProvider(ARBITRUM_PROTOCOL_DATA_PROVIDER),
            _rewardsController: IAaveV3RewardsController(ARBITRUM_REWARDS_CONTROLLER),
            _collateralUnderlyingAddresses: toArray(
                ARBITRUM_WBTC, ARBITRUM_LINK, ARBITRUM_DAI, ARBITRUM_USDC, ARBITRUM_USDT
            ),
            _borrowableUnderlyingAddresses: toArray(ARBITRUM_USDC, ARBITRUM_LINK),
            _rewardedCollateralUnderlyingAddress: ARBITRUM_USDC
        });
    }
}

abstract contract AaveV3DebtPositionTestBaseBaseChain is AaveV3DebtPositionTestBase {
    function __initialize(EnzymeVersion _version) internal {
        __initialize({
            _version: _version,
            _chainId: BASE_CHAIN_ID,
            _merklDistributor: IMerklDistributor(BASE_MERKL_DISTRIBUTOR),
            _poolAddressProvider: IAaveV3PoolAddressProvider(BASE_POOL_ADDRESS_PROVIDER),
            _protocolDataProvider: IAaveV3ProtocolDataProvider(BASE_PROTOCOL_DATA_PROVIDER),
            _rewardsController: IAaveV3RewardsController(BASE_REWARDS_CONTROLLER),
            _collateralUnderlyingAddresses: toArray(BASE_WETH, BASE_WSTETH, BASE_CBETH),
            _borrowableUnderlyingAddresses: toArray(BASE_USDC, BASE_WSTETH),
            _rewardedCollateralUnderlyingAddress: BASE_USDC
        });
    }
}

contract AaveV3DebtPositionTestEthereum is AaveV3DebtPositionTestBaseEthereum {
    function setUp() public override {
        __initialize(EnzymeVersion.Current);
    }
}

contract AaveV3DebtPositionTestEthereumV4 is AaveV3DebtPositionTestBaseEthereum {
    function setUp() public override {
        __initialize(EnzymeVersion.V4);
    }
}

contract AaveV3DebtPositionTestPolygon is AaveV3DebtPositionTestBasePolygon {
    function setUp() public override {
        __initialize(EnzymeVersion.Current);
    }
}

contract AaveV3DebtPositionTestPolygonV4 is AaveV3DebtPositionTestBasePolygon {
    function setUp() public override {
        __initialize(EnzymeVersion.V4);
    }
}

contract AaveV3DebtPositionTestArbitrum is AaveV3DebtPositionTestBaseArbitrum {
    function setUp() public override {
        __initialize(EnzymeVersion.Current);
    }
}

contract AaveV3DebtPositionTestArbitrumV4 is AaveV3DebtPositionTestBaseArbitrum {
    function setUp() public override {
        __initialize(EnzymeVersion.V4);
    }
}

contract AaveV3DebtPositionTestBaseChain is AaveV3DebtPositionTestBaseBaseChain {
    function setUp() public override {
        __initialize(EnzymeVersion.Current);
    }
}

contract AaveV3DebtPositionTestBaseChainV4 is AaveV3DebtPositionTestBaseBaseChain {
    function setUp() public override {
        __initialize(EnzymeVersion.V4);
    }
}
