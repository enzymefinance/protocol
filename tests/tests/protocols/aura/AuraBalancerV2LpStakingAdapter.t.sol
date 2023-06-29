// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IERC20} from "tests/interfaces/external/IERC20.sol";

import {IAuraBalancerV2LpStakingWrapperFactory} from
    "tests/interfaces/internal/IAuraBalancerV2LpStakingWrapperFactory.sol";
import {IIntegrationAdapter} from "tests/interfaces/internal/IIntegrationAdapter.sol";

import {BalancerAndAuraPoolTest} from "../balancer/BalancerV2LiquidityAdapter.t.sol";
import {AuraBalancerV2Utils} from "./AuraBalancerV2Utils.sol";

abstract contract EthereumPoolTest is BalancerAndAuraPoolTest, AuraBalancerV2Utils {
    uint256 internal auraPoolPid;

    function setUp() public virtual override {
        setUpMainnetEnvironment();

        isAura = true;
        balToken = IERC20(ETHEREUM_BAL);

        // Deploy the staking wrapper factory and wrapped staking token
        IAuraBalancerV2LpStakingWrapperFactory stakingWrapperFactory =
            deployStakingWrapperFactory({_dispatcher: core.persistent.dispatcher});
        stakingToken = IERC20(stakingWrapperFactory.deploy(auraPoolPid));

        // Deploy the adapter
        adapter = IIntegrationAdapter(__deployAdapter(stakingWrapperFactory));

        // Run common setup after all other setup
        super.setUp();
    }

    function __deployAdapter(IAuraBalancerV2LpStakingWrapperFactory _stakingWrapperFactory)
        internal
        returns (address adapterAddress_)
    {
        bytes memory args = abi.encode(core.release.integrationManager, balancerVault, _stakingWrapperFactory);
        return deployCode("AuraBalancerV2LpStakingAdapter.sol", args);
    }
}

// ACTUAL TESTS, RUN PER-POOL

contract EthereumUsdcDaiUsdtPoolTest is EthereumPoolTest {
    function setUp() public override {
        // Define pool before all other setup
        poolId = ETHEREUM_USDC_DAI_USDT_POOL_ID;
        poolBpt = IERC20(ETHEREUM_USDC_DAI_USDT_POOL_ADDRESS);
        poolType = PoolType.ComposableStable;
        auraPoolPid = ETHEREUM_USDC_DAI_USDT_POOL_PID;

        super.setUp();
    }
}
