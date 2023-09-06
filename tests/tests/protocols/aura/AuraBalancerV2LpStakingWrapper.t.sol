// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IERC20} from "tests/interfaces/external/IERC20.sol";

import {AuraBalancerV2Utils, ETHEREUM_BOOSTER_ADDRESS} from "tests/tests/protocols/aura/AuraBalancerV2Utils.sol";
import {ConvexAndAuraTest} from "tests/tests/protocols/convex/ConvexCurveLpStakingWrapper.t.sol";

import {IConvexBooster} from "tests/interfaces/external/IConvexBooster.sol";

import {IConvexCurveLpStakingWrapperFactory} from "tests/interfaces/internal/IConvexCurveLpStakingWrapperFactory.sol";

contract EthereumAuraTest is ConvexAndAuraTest, AuraBalancerV2Utils {
    function setUp() public virtual override {
        setUpMainnetEnvironment(ETHEREUM_BLOCK_TEMP_TIME_SENSITIVE);

        booster = IConvexBooster(ETHEREUM_BOOSTER_ADDRESS);
        crvToken = IERC20(ETHEREUM_BAL);
        cvxToken = IERC20(ETHEREUM_AURA);
        stashTokenStartPid = 48;

        // R-DAI w/ LDO extra reward stash
        uint256 poolWithStashTokenPid = 97;
        poolWithStashToken = PoolWithExtraReward({pid: poolWithStashTokenPid, extraRewardToken: IERC20(ETHEREUM_LDO)});

        stakingWrapperFactory = IConvexCurveLpStakingWrapperFactory(
            address(deployAuraStakingWrapperFactory({_dispatcher: core.persistent.dispatcher}))
        );

        super.setUp();
    }
}
