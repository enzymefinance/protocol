// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IERC20} from "tests/interfaces/external/IERC20.sol";

import {IAuraBalancerV2LpStakingWrapperFactory} from
    "tests/interfaces/internal/IAuraBalancerV2LpStakingWrapperFactory.sol";

import {BalancerAndAuraTest} from "../balancer/BalancerV2LiquidityAdapter.t.sol";
import {AuraBalancerV2Utils} from "./AuraBalancerV2Utils.sol";

contract EthereumTest is BalancerAndAuraTest, AuraBalancerV2Utils {
    IAuraBalancerV2LpStakingWrapperFactory internal stakingWrapperFactory;

    function __deployAdapter() internal override returns (address adapterAddress_) {
        bytes memory args = abi.encode(core.release.integrationManager, balancerVault, stakingWrapperFactory);
        return deployCode("AuraBalancerV2LpStakingAdapter.sol", args);
    }

    function setUp() public override {
        setUpMainnetEnvironment();

        // Define pools to use throughout
        isAura = true;
        balToken = IERC20(ETHEREUM_BAL);
        poolId = ETHEREUM_USDC_DAI_USDT_POOL_ID;
        poolBpt = IERC20(ETHEREUM_USDC_DAI_USDT_POOL_ADDRESS);
        poolType = PoolType.ComposableStable;
        uint256 auraPoolPid = ETHEREUM_USDC_DAI_USDT_POOL_PID;

        // Deploy the staking wrapper factory and the staking wrapper for the pool
        stakingWrapperFactory = deployStakingWrapperFactory({_dispatcher: core.persistent.dispatcher});
        stakingToken = IERC20(stakingWrapperFactory.deploy(auraPoolPid));

        // Run common setup.
        // Dependency: stakingWrapperFactory deployment
        super.setUp();
    }
}
