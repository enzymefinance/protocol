// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IERC20} from "tests/interfaces/external/IERC20.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {ConvexUtils, ETHEREUM_BOOSTER_ADDRESS} from "tests/tests/protocols/convex/ConvexUtils.sol";
import {AddressArrayLib} from "tests/utils/libs/AddressArrayLib.sol";

import {IConvexBooster} from "tests/interfaces/external/IConvexBooster.sol";

import {IConvexCurveLpStakingWrapperFactory} from "tests/interfaces/internal/IConvexCurveLpStakingWrapperFactory.sol";
import {IConvexCurveLpStakingWrapperLib} from "tests/interfaces/internal/IConvexCurveLpStakingWrapperLib.sol";

abstract contract ConvexAndAuraTest is IntegrationTest, ConvexUtils {
    using AddressArrayLib for address[];

    event AddExtraRewardsBypassed();

    event HarvestUpdateBypassed(address indexed rewardToken);

    event RewardTokenRemoved(address token);

    // Assigned in child contract setup
    IConvexBooster internal booster;
    IERC20 internal crvToken;
    IERC20 internal cvxToken;
    uint256 internal stashTokenStartPid;
    IConvexCurveLpStakingWrapperFactory internal stakingWrapperFactory;

    // Purpose: test that the wrapper bypasses checkpointing a harvest of a reward token with an unexpected interface
    // during `__checkpoint()`, which is called during `deposit()`
    function test_checkpoint_successWithBypassedHarvestFailure() public {
        // Any pid will do
        uint256 pid = stashTokenStartPid;

        // Deploy a wrapper
        IConvexCurveLpStakingWrapperLib wrapper = IConvexCurveLpStakingWrapperLib(stakingWrapperFactory.deploy(pid));

        // Add an incompatible reward token to the wrapper
        address badRewardTokenAddress = addBadRewardTokenToStakingWrapper(wrapper);

        // Seed the test contract with the wrapper's Curve LP token and approve for a deposit
        IERC20 lpToken = IERC20(wrapper.getCurveLpToken());
        uint256 depositAmount = 1;
        lpToken.approve(address(wrapper), depositAmount);

        increaseTokenBalance({_token: lpToken, _to: address(this), _amount: depositAmount});

        // Define event assertion for the failed harvest checkpoint
        expectEmit(address(wrapper));
        emit HarvestUpdateBypassed(badRewardTokenAddress);

        // Depositing checkpoints the harvest and depositing user
        wrapper.deposit(depositAmount);
    }

    // Purpose: test that the wrapper bypasses checkpointing a harvest of a reward token with an unexpected interface
    // during `__checkpointAndClaim()`, which is called during `claimRewardsFor()`
    function test_checkpointAndClaim_successWithBypassedHarvestFailure() public {
        // Any pid will do
        uint256 pid = stashTokenStartPid;

        // Deploy a wrapper
        IConvexCurveLpStakingWrapperLib wrapper = IConvexCurveLpStakingWrapperLib(stakingWrapperFactory.deploy(pid));

        // Add an incompatible reward token to the wrapper
        address badRewardTokenAddress = addBadRewardTokenToStakingWrapper(wrapper);

        // Define event assertion for the failed harvest checkpoint
        expectEmit(address(wrapper));
        emit HarvestUpdateBypassed(badRewardTokenAddress);

        // Claiming rewards on the wrapper for any account triggers the harvest checkpoint
        wrapper.claimRewardsFor(address(0));
    }

    // Purpose: test that the wrapper bypasses adding a reward token with an unexpected interface (non-stashToken)
    // during `__harvestRewardsLogic()`, which is called during `claimRewardsFor()`
    function test_harvestRewardsLogic_successWithBypassedAddExtraRewardTokens() public {
        // Use the first pid that requires stash tokens for extra rewards
        uint256 pid = stashTokenStartPid;
        // Any ERC20 token will do since it will not be a StashToken
        address badRewardTokenAddress = address(wethToken);

        // Deploy a wrapper
        IConvexCurveLpStakingWrapperLib wrapper = IConvexCurveLpStakingWrapperLib(stakingWrapperFactory.deploy(pid));

        uint256 preTxRewardTokenCount = wrapper.getRewardTokenCount();

        // Add the incompatible reward token to the Convex pool, which will be discovered upon addExtraRewards()
        addExtraRewardTokenToConvexPool({_booster: booster, _pid: pid, _extraRewardTokenAddress: badRewardTokenAddress});

        // Define event assertion for discovery of bad token
        expectEmit(address(wrapper));
        emit AddExtraRewardsBypassed();

        // Claiming rewards on the wrapper for any account triggers the rewards harvesting
        wrapper.claimRewardsFor(address(0));

        // Confirm that the bad reward token was not added to the wrapper
        assertEq(wrapper.getRewardTokenCount(), preTxRewardTokenCount);
    }

    function test_removeExtraRewardToken_failWithCoreToken() public {
        // Any pid will do
        uint256 pid = stashTokenStartPid;

        // Deploy a wrapper
        IConvexCurveLpStakingWrapperLib wrapper = IConvexCurveLpStakingWrapperLib(stakingWrapperFactory.deploy(pid));

        // Trying to remove either core token (CRV or CVX) should fail
        vm.expectRevert("removeExtraRewardToken: Invalid token");
        wrapper.removeExtraRewardToken(address(crvToken));

        vm.expectRevert("removeExtraRewardToken: Invalid token");
        wrapper.removeExtraRewardToken(address(cvxToken));
    }

    function test_removeExtraRewardToken_failWithUnauthorized() public {
        // Any pid will do
        uint256 pid = stashTokenStartPid;

        // Deploy a wrapper
        IConvexCurveLpStakingWrapperLib wrapper = IConvexCurveLpStakingWrapperLib(stakingWrapperFactory.deploy(pid));

        // Add any reward token to the wrapper
        address rewardTokenAddress = addBadRewardTokenToStakingWrapper(wrapper);

        address randomUser = makeAddr("RandomUser");
        vm.prank(randomUser);
        vm.expectRevert("removeExtraRewardToken: Unauthorized");
        wrapper.removeExtraRewardToken(rewardTokenAddress);
    }

    function test_removeExtraRewardToken_success() public {
        // Any pid will do
        uint256 pid = stashTokenStartPid;

        // Deploy a wrapper
        IConvexCurveLpStakingWrapperLib wrapper = IConvexCurveLpStakingWrapperLib(stakingWrapperFactory.deploy(pid));

        // Add any reward token to the wrapper
        address rewardTokenAddress = addBadRewardTokenToStakingWrapper(wrapper);

        uint256 preTxRewardTokenCount = wrapper.getRewardTokenCount();

        // Define event assertions for removal of reward token
        expectEmit(address(wrapper));
        emit RewardTokenRemoved(rewardTokenAddress);

        // Remove the reward token from the wrapper
        wrapper.removeExtraRewardToken(rewardTokenAddress);

        // Confirm that the reward token was removed from the wrapper
        assertEq(wrapper.getRewardTokenCount(), preTxRewardTokenCount - 1);
        assertFalse(wrapper.getRewardTokens().contains(rewardTokenAddress));
    }
}

// TODO: port all test cases from hardhat test suite

contract EthereumConvexTest is ConvexAndAuraTest {
    function setUp() public virtual override {
        setUpMainnetEnvironment();

        booster = IConvexBooster(ETHEREUM_BOOSTER_ADDRESS);
        crvToken = IERC20(ETHEREUM_CRV);
        cvxToken = IERC20(ETHEREUM_CVX);
        stashTokenStartPid = 151;

        stakingWrapperFactory = deployConvexStakingWrapperFactory({_dispatcher: core.persistent.dispatcher});
    }
}
