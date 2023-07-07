// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IERC20} from "tests/interfaces/external/IERC20.sol";

import {IAuraBalancerV2LpStakingWrapperFactory} from
    "tests/interfaces/internal/IAuraBalancerV2LpStakingWrapperFactory.sol";
import {IConvexCurveLpStakingWrapperLib} from "tests/interfaces/internal/IConvexCurveLpStakingWrapperLib.sol";
import {IIntegrationAdapter} from "tests/interfaces/internal/IIntegrationAdapter.sol";
import {ConvexUtils} from "tests/tests/protocols/convex/ConvexUtils.sol";

import {BalancerAndAuraPoolTest} from "../balancer/BalancerV2LiquidityAdapter.t.sol";
import {
    AuraBalancerV2Utils, ETHEREUM_USDC_DAI_USDT_POOL_PID, ETHEREUM_STETH_POOL_PID
} from "./AuraBalancerV2Utils.sol";

abstract contract EthereumPoolTest is BalancerAndAuraPoolTest, AuraBalancerV2Utils, ConvexUtils {
    uint256 internal auraPoolPid;

    function setUp() public virtual override {
        setUpMainnetEnvironment();

        isAura = true;
        balToken = IERC20(ETHEREUM_BAL);

        // Deploy the staking wrapper factory and wrapped staking token
        IAuraBalancerV2LpStakingWrapperFactory stakingWrapperFactory =
            deployAuraStakingWrapperFactory({_dispatcher: core.persistent.dispatcher});
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

// ** uses a StashToken as extra rewards
contract EthereumStethPoolTest is EthereumPoolTest {
    function setUp() public override {
        // Define pool before all other setup
        poolId = ETHEREUM_STETH_POOL_ID;
        poolBpt = IERC20(ETHEREUM_STETH_POOL_ADDRESS);
        poolType = PoolType.LegacyStable;
        auraPoolPid = ETHEREUM_STETH_POOL_PID;

        // Run common setup
        super.setUp();

        IConvexCurveLpStakingWrapperLib wrapper = IConvexCurveLpStakingWrapperLib(address(stakingToken));

        // Add a bogus ERC20-incompatible reward token to the wrapper,
        // just to confirm that it doesn't interfere with any processes
        addBadRewardTokenToStakingWrapper(wrapper);

        // Confirm that the reward tokens were registered as-expected
        address[] memory rewardTokens = wrapper.getRewardTokens();
        // 4 reward tokens: BAL, AURA, StashToken, and the bad reward token
        assertEq(rewardTokens.length, 4, "unexpected reward tokens count");
        // StashToken should be stored as the underlying, not the StashToken itself
        assertEq(rewardTokens[2], ETHEREUM_LDO, "unexpected extra reward token");
    }
}
