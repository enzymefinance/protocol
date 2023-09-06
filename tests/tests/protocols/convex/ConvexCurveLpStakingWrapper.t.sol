// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.19;

import {IERC20} from "tests/interfaces/external/IERC20.sol";

import {IntegrationTest} from "tests/bases/IntegrationTest.sol";

import {ConvexUtils, ETHEREUM_BOOSTER_ADDRESS} from "tests/tests/protocols/convex/ConvexUtils.sol";
import {AddressArrayLib} from "tests/utils/libs/AddressArrayLib.sol";

import {IConvexBaseRewardPool} from "tests/interfaces/external/IConvexBaseRewardPool.sol";
import {IConvexBooster} from "tests/interfaces/external/IConvexBooster.sol";

import {IConvexCurveLpStakingWrapperFactory} from "tests/interfaces/internal/IConvexCurveLpStakingWrapperFactory.sol";
import {IConvexCurveLpStakingWrapperLib} from "tests/interfaces/internal/IConvexCurveLpStakingWrapperLib.sol";

abstract contract ConvexAndAuraTest is IntegrationTest, ConvexUtils {
    using AddressArrayLib for address[];

    // Testing struct
    struct PoolWithExtraReward {
        uint256 pid;
        IERC20 extraRewardToken;
    }

    event Deposited(address indexed from, address indexed to, uint256 amount);

    event RewardsClaimed(address caller, address indexed user, address[] rewardTokens, uint256[] claimedAmounts);

    event Withdrawn(address indexed caller, address indexed from, address indexed to, uint256 amount);

    address internal depositor1 = makeAddr("Depositor1");
    address internal depositor2 = makeAddr("Depositor2");
    address internal factoryOwner;
    IConvexCurveLpStakingWrapperLib wrapperWithStash;

    // Assigned in child contract setup
    IConvexCurveLpStakingWrapperFactory internal stakingWrapperFactory;
    IConvexBooster internal booster;
    IERC20 internal crvToken;
    IERC20 internal cvxToken;
    uint256 internal stashTokenStartPid;
    PoolWithExtraReward internal poolWithStashToken;

    function setUp() public virtual override {
        factoryOwner = stakingWrapperFactory.getOwner();

        wrapperWithStash = IConvexCurveLpStakingWrapperLib(stakingWrapperFactory.deploy(poolWithStashToken.pid));

        // Seed depositors with the wrapper's Curve LP token and grant allowance to wrapper
        IERC20 lpToken = IERC20(wrapperWithStash.getCurveLpToken());
        uint256 lpTokenStartingBalance = assetUnit(lpToken);
        increaseTokenBalance({_token: lpToken, _to: depositor1, _amount: lpTokenStartingBalance});
        increaseTokenBalance({_token: lpToken, _to: depositor2, _amount: lpTokenStartingBalance});
        vm.prank(depositor1);
        lpToken.approve(address(wrapperWithStash), type(uint256).max);
        vm.prank(depositor2);
        lpToken.approve(address(wrapperWithStash), type(uint256).max);
    }

    // TODO: togglePause() tests

    function test_init_failWhenCalledTwice() public {
        // Any pool will do
        IConvexCurveLpStakingWrapperLib wrapper = wrapperWithStash;

        vm.expectRevert("init: Initialized");
        wrapper.init(1);
    }

    function test_init_successWithStashToken() public {
        // Use pool with extra reward stash
        IConvexCurveLpStakingWrapperLib wrapper = wrapperWithStash;
        uint256 pid = poolWithStashToken.pid;
        address extraRewardTokenAddress = address(poolWithStashToken.extraRewardToken);

        // Assert wrapper storage: Convex pool info
        assertEq(wrapper.getConvexPoolId(), pid, "Incorrect Convex pool id");
        IConvexBooster.PoolInfo memory poolInfo = booster.poolInfo(pid);
        assertEq(wrapper.getConvexPool(), poolInfo.crvRewards, "Incorrect Convex pool");
        assertEq(wrapper.getCurveLpToken(), poolInfo.lptoken, "Incorrect Curve LP token");

        // Assert wrapper storage: Convex pool rewards
        address[] memory rewardTokens = wrapper.getRewardTokens();
        assertEq(rewardTokens.length, 3, "Incorrect reward token count");
        assertEq(rewardTokens[0], address(crvToken), "Incorrect CRV reward token");
        assertEq(rewardTokens[1], address(cvxToken), "Incorrect CVX reward token");
        assertEq(rewardTokens[2], extraRewardTokenAddress, "Incorrect extra reward token");

        // ERC20 info asserted in parent test suite
    }

    function test_addExtraRewards_successWithNewRewardToken() public {
        // Use pool that isn't using the poolWithStashToken's extra reward
        IConvexCurveLpStakingWrapperLib wrapper;
        uint256 pid = poolWithStashToken.pid;
        bool found;
        while (!found) {
            // increment pid by 1 until a pool without the same extra reward is found
            pid++;

            wrapper = IConvexCurveLpStakingWrapperLib(stakingWrapperFactory.deploy(pid));

            if (!wrapper.getRewardTokens().contains(address(poolWithStashToken.extraRewardToken))) {
                found = true;
            }
        }

        uint256 preTxRewardTokenCount = wrapper.getRewardTokenCount();

        // Add a poolWithStashToken's stash token as an extra reward
        address extraRewardPoolAddress =
            IConvexBaseRewardPool(booster.poolInfo(poolWithStashToken.pid).crvRewards).extraRewards(0);
        addExtraRewardPoolToConvexPool({_booster: booster, _pid: pid, _extraRewardPoolAddress: extraRewardPoolAddress});

        // Call the wrapper to register the new reward token
        wrapper.addExtraRewards();

        // Assert the new reward token was added
        address[] memory finalRewardTokens = wrapper.getRewardTokens();
        uint256 finalRewardTokenCount = finalRewardTokens.length;
        assertEq(finalRewardTokenCount, preTxRewardTokenCount + 1, "Incorrect post-tx reward token count");
        assertEq(
            finalRewardTokens[finalRewardTokenCount - 1],
            address(poolWithStashToken.extraRewardToken),
            "Incorrect extra reward token"
        );
    }

    // TODO: deposit fail when paused

    function test_depositTo_success() public {
        IConvexCurveLpStakingWrapperLib wrapper = wrapperWithStash;
        IERC20 lpToken = IERC20(wrapper.getCurveLpToken());

        // 1. Depositor1 - deposits to self

        uint256 depositor1InitialBalance = lpToken.balanceOf(depositor1);
        uint256 depositor1Amount = depositor1InitialBalance / 4;

        // Pre-assert event
        expectEmit(address(wrapper));
        emit Deposited(depositor1, depositor1, depositor1Amount);

        vm.prank(depositor1);
        wrapper.depositTo({_to: depositor1, _amount: depositor1Amount});

        // Assert the lpToken and wrapper balance changes
        assertEq(
            lpToken.balanceOf(depositor1),
            depositor1InitialBalance - depositor1Amount,
            "Incorrect depositor1 LP balance"
        );
        assertEq(wrapper.balanceOf(depositor1), depositor1Amount, "Incorrect depositor1 wrapper balance");

        // Allow some time to pass
        skip(1 days);

        // 2. Depositor2 - deposits to third party

        uint256 depositor2InitialBalance = lpToken.balanceOf(depositor2);
        uint256 depositor2Amount = depositor1Amount / 3;
        address depositor2To = makeAddr("Depositor2To");

        // Pre-assert event
        expectEmit(address(wrapper));
        emit Deposited(depositor2, depositor2To, depositor2Amount);

        vm.prank(depositor2);
        wrapper.depositTo({_to: depositor2To, _amount: depositor2Amount});

        // Assert the lpToken and wrapper balance changes
        assertEq(
            lpToken.balanceOf(depositor2),
            depositor2InitialBalance - depositor2Amount,
            "Incorrect depositor2 LP balance"
        );
        assertEq(wrapper.balanceOf(depositor2To), depositor2Amount, "Incorrect depositor2 wrapper balance");

        // Assert the total wrapper supply
        assertEq(wrapper.totalSupply(), depositor1Amount + depositor2Amount, "Incorrect total wrapper supply");
    }

    function test_withdrawTo_success() public {
        IConvexCurveLpStakingWrapperLib wrapper = wrapperWithStash;
        IERC20 lpToken = IERC20(wrapper.getCurveLpToken());

        // Make deposits from both depositors
        uint256 depositor1InitialBalance = lpToken.balanceOf(depositor1);
        uint256 depositor1Amount = depositor1InitialBalance / 4;
        vm.prank(depositor1);
        wrapper.depositTo({_to: depositor1, _amount: depositor1Amount});

        uint256 depositor2InitialBalance = lpToken.balanceOf(depositor2);
        uint256 depositor2Amount = depositor1Amount / 3;
        vm.prank(depositor2);
        wrapper.depositTo({_to: depositor2, _amount: depositor2Amount});

        // 1. Depositor1 - redeems to self

        uint256 withdrawal1Amount = depositor1Amount / 4;

        // Pre-assert event
        expectEmit(address(wrapper));
        emit Withdrawn(depositor1, depositor1, depositor1, withdrawal1Amount);

        vm.prank(depositor1);
        wrapper.withdrawTo({_to: depositor1, _amount: withdrawal1Amount});

        // Assert the lpToken and wrapper balance changes
        assertEq(
            lpToken.balanceOf(depositor1),
            depositor1InitialBalance - depositor1Amount + withdrawal1Amount,
            "Incorrect depositor1 LP balance"
        );
        assertEq(
            wrapper.balanceOf(depositor1), depositor1Amount - withdrawal1Amount, "Incorrect depositor1 wrapper balance"
        );

        // Allow some time to pass
        skip(1 days);

        // 2. Depositor2 - redeems to third party

        uint256 withdrawal2Amount = depositor2Amount / 3;
        address withdrawal2Recipient = makeAddr("Withdrawal2Recipient");

        // Pre-assert event
        expectEmit(address(wrapper));
        emit Withdrawn(depositor2, depositor2, withdrawal2Recipient, withdrawal2Amount);

        vm.prank(depositor2);
        wrapper.withdrawTo({_to: withdrawal2Recipient, _amount: withdrawal2Amount});

        // Assert the lpToken and wrapper balance changes
        assertEq(
            lpToken.balanceOf(depositor2),
            depositor2InitialBalance - depositor2Amount,
            "Incorrect depositor2 LP balance"
        );
        assertEq(
            lpToken.balanceOf(withdrawal2Recipient), withdrawal2Amount, "Incorrect withdrawal2 recipient LP balance"
        );
        assertEq(
            wrapper.balanceOf(depositor2), depositor2Amount - withdrawal2Amount, "Incorrect depositor2 wrapper balance"
        );
    }

    // TODO: withdraw on behalf

    function test_claimRewards_successWithOneDepositor() public {
        IConvexCurveLpStakingWrapperLib wrapper = wrapperWithStash;
        IERC20 lpToken = IERC20(wrapper.getCurveLpToken());
        IERC20 extraRewardToken = poolWithStashToken.extraRewardToken;
        address claimRewardsCaller = makeAddr("ClaimRewardsCaller");

        // Validate that the depositor doesn't have a starting balance of any reward token
        assertEq(crvToken.balanceOf(depositor1), 0, "depositor1 has CRV balance");
        assertEq(cvxToken.balanceOf(depositor1), 0, "depositor1 has CVX balance");
        assertEq(extraRewardToken.balanceOf(depositor1), 0, "depositor1 has extraRewardToken balance");

        // Make a deposit from depositor1
        uint256 depositor1Amount = lpToken.balanceOf(depositor1) / 4;
        vm.prank(depositor1);
        wrapper.depositTo({_to: depositor1, _amount: depositor1Amount});

        // TODO: logic to renew rewards for stash

        // Allow some time to pass
        skip(1 days);

        // Pre-assert event
        // TODO: just want claimedAmounts > 0
        // expectEmit(address(wrapper));
        // emit RewardsClaimed(claimRewardsCaller, depositor1, address[] rewardTokens, uint256[] claimedAmounts);

        // Claim rewards for depositor1
        vm.prank(claimRewardsCaller);
        wrapper.claimRewardsFor(depositor1);

        // Assert the depositor has all rewards balances and the wrapper has none
        assertTrue(crvToken.balanceOf(depositor1) > 0, "depositor1 has no CRV balance");
        assertTrue(cvxToken.balanceOf(depositor1) > 0, "depositor1 has no CVX balance");
        assertTrue(extraRewardToken.balanceOf(depositor1) > 0, "depositor1 has no extraRewardToken balance");

        assertEq(crvToken.balanceOf(address(wrapper)), 0, "wrapper has CRV balance");
        assertEq(cvxToken.balanceOf(address(wrapper)), 0, "wrapper has CVX balance");
        assertEq(extraRewardToken.balanceOf(address(wrapper)), 0, "wrapper has extraRewardToken balance");
    }

    // TODO: redo as a fuzz test
    function test_claimRewards_successWithTwoDepositors() public {
        IConvexCurveLpStakingWrapperLib wrapper = wrapperWithStash;
        IERC20 lpToken = IERC20(wrapper.getCurveLpToken());
        IERC20 extraRewardToken = poolWithStashToken.extraRewardToken;
        address claimRewardsCaller = makeAddr("ClaimRewardsCaller");

        // Deposit different amounts from both depositors
        uint256 depositor1Amount = lpToken.balanceOf(depositor1) / 4;
        uint256 depositor2Amount = depositor1Amount / 5;

        vm.prank(depositor1);
        wrapper.depositTo({_to: depositor1, _amount: depositor1Amount});
        vm.prank(depositor2);
        wrapper.depositTo({_to: depositor2, _amount: depositor2Amount});

        // TODO: logic to renew rewards for stash

        // Allow some time to pass
        skip(1 days);

        // Withdraw all to stop rewards accrual
        vm.prank(depositor1);
        wrapper.withdrawTo({_to: depositor1, _amount: depositor1Amount});
        vm.prank(depositor2);
        wrapper.withdrawTo({_to: depositor2, _amount: depositor2Amount});

        // Claim rewards for both depositors
        vm.startPrank(claimRewardsCaller);
        wrapper.claimRewardsFor(depositor1);
        wrapper.claimRewardsFor(depositor2);
        vm.stopPrank();

        // Assert the wrapper has no rewards balances (with a tolerance of 1 wei)
        {
            assertApproxEqAbs(crvToken.balanceOf(address(wrapper)), 0, 1, "wrapper has CRV balance");
            assertApproxEqAbs(cvxToken.balanceOf(address(wrapper)), 0, 1, "wrapper has CVX balance");
            assertApproxEqAbs(
                extraRewardToken.balanceOf(address(wrapper)), 0, 1, "wrapper has extraRewardToken balance"
            );
        }

        // Assert the depositors have received pro-rata reward amounts.
        // Only need to check one depositor since the other will be the remainder.

        uint256 depositor1CrvBalance = crvToken.balanceOf(depositor1);
        uint256 depositor1CvxBalance = cvxToken.balanceOf(depositor1);
        uint256 depositor1ExtraRewardBalance = extraRewardToken.balanceOf(depositor1);

        uint256 totalCrv = depositor1CrvBalance + crvToken.balanceOf(depositor2);
        uint256 totalCvx = depositor1CvxBalance + cvxToken.balanceOf(depositor2);
        uint256 totalExtraReward = depositor1ExtraRewardBalance + extraRewardToken.balanceOf(depositor2);

        assertApproxEqAbs(
            depositor1CrvBalance,
            totalCrv * depositor1Amount / (depositor1Amount + depositor2Amount),
            1,
            "depositor1 has incorrect CRV balance"
        );
        assertApproxEqAbs(
            depositor1CvxBalance,
            totalCvx * depositor1Amount / (depositor1Amount + depositor2Amount),
            1,
            "depositor1 has incorrect CVX balance"
        );
        assertApproxEqAbs(
            depositor1ExtraRewardBalance,
            totalExtraReward * depositor1Amount / (depositor1Amount + depositor2Amount),
            1,
            "depositor1 has incorrect extraRewardToken balance"
        );
    }

    // TODO: ERC20 transfers (if rewards checkpointing on transfer)
}

contract EthereumConvexTest is ConvexAndAuraTest {
    address internal ETHEREUM_CNC = 0x9aE380F0272E2162340a5bB646c354271c0F5cFC;

    function setUp() public virtual override {
        setUpMainnetEnvironment(ETHEREUM_BLOCK_TEMP_TIME_SENSITIVE);

        booster = IConvexBooster(ETHEREUM_BOOSTER_ADDRESS);
        crvToken = IERC20(ETHEREUM_CRV);
        cvxToken = IERC20(ETHEREUM_CVX);
        stashTokenStartPid = 151;

        // ETH-CNC w/ CNC extra reward stash
        uint256 poolWithStashTokenPid = 152;
        poolWithStashToken = PoolWithExtraReward({pid: poolWithStashTokenPid, extraRewardToken: IERC20(ETHEREUM_CNC)});

        stakingWrapperFactory = deployConvexStakingWrapperFactory({_dispatcher: core.persistent.dispatcher});

        super.setUp();
    }

    function test_erc20_info_success() public {
        // Any pool will do
        IConvexCurveLpStakingWrapperLib wrapper = wrapperWithStash;

        // Assert ERC20 state
        assertEq(wrapper.name(), "Enzyme Staked: Curve.fi Factory Crypto Pool: CNC/ETH Convex Deposit");
        assertEq(wrapper.symbol(), "stkcvxCNCETH-f");
        assertEq(wrapper.decimals(), 18);
    }
}
