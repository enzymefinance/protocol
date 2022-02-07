// import { extractEvent, randomAddress } from '@enzymefinance/ethers';
import { randomAddress } from '@enzymefinance/ethers';
import type { ConvexCurveLpStakingWrapperFactory } from '@enzymefinance/protocol';
import { ConvexCurveLpStakingWrapperLib, IConvexBooster, StandardToken } from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import { assertEvent, deployProtocolFixture, getAssetUnit } from '@enzymefinance/testutils';
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import type { BigNumber } from 'ethers';

const randomRecipient = randomAddress();
const pid = 25; // steth
let curveLpToken: StandardToken;
let factory: ConvexCurveLpStakingWrapperFactory;
let wrapper: ConvexCurveLpStakingWrapperLib;
let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();

  curveLpToken = new StandardToken(fork.config.curve.pools.steth.lpToken, whales.stecrv);

  factory = fork.deployment.convexCurveLpStakingWrapperFactory;
  await factory.deploy(pid);

  wrapper = new ConvexCurveLpStakingWrapperLib(await factory.getWrapperForConvexPool(pid), provider);
});

describe('init', () => {
  it('does not allow calling twice', async () => {
    await expect(wrapper.connect(fork.deployer).init(1)).rejects.toBeRevertedWith('Initialized');
  });

  it('initializes values correctly', async () => {
    const convexBooster = new IConvexBooster(fork.config.convex.booster, provider);
    const poolInfo = await convexBooster.poolInfo(pid);

    // Assert state
    expect(await wrapper.getConvexPool()).toMatchAddress(poolInfo.crvRewards);
    expect(await wrapper.getConvexPoolId()).toEqBigNumber(pid);
    expect(await wrapper.getCurveLpToken()).toMatchAddress(poolInfo.lptoken);

    // Rewards tokens should include crv, cvx, and ldo
    const rewardsTokens = await wrapper.getRewardTokens();
    expect(rewardsTokens.length).toBe(3);
    expect(rewardsTokens[0]).toMatchAddress(fork.config.convex.crvToken);
    expect(rewardsTokens[1]).toMatchAddress(fork.config.convex.cvxToken);
    expect(rewardsTokens[2]).toMatchAddress(fork.config.primitives.ldo);

    // Get ERC20 token info
    expect(await wrapper.name()).toEqual('Enzyme Staked: Curve.fi ETH/stETH Convex Deposit');
    expect(await wrapper.symbol()).toEqual('stkcvxsteCRV');
  });
});

describe('addRewards', () => {
  it('does not add new items if no new pool reward tokens are found', async () => {
    const preTxRewardsTokens = await wrapper.getRewardTokens();

    await wrapper.getRewardTokens();

    const postTxRewardsTokens = await wrapper.getRewardTokens();

    expect(postTxRewardsTokens.length).toBe(preTxRewardsTokens.length);
    expect(await wrapper.getRewardTokens()).toEqual(preTxRewardsTokens);
  });
});

describe('togglePause', () => {
  it('does not allow a random caller', async () => {
    await expect(wrapper.connect(fork.deployer).togglePause(true)).rejects.toBeRevertedWith('Only owner callable');
  });

  it.todo('happy path');
});

describe('actions', () => {
  let depositor1: SignerWithAddress, depositor2: SignerWithAddress;
  let lpTokenStartingBalance: BigNumber;
  beforeEach(async () => {
    lpTokenStartingBalance = await getAssetUnit(curveLpToken);
    [depositor1, depositor2] = fork.accounts;
    await curveLpToken.transfer(depositor1, lpTokenStartingBalance);
    await curveLpToken.transfer(depositor2, lpTokenStartingBalance);
  });

  describe('deposit', () => {
    // These can be added to tests of the base functionality
    it.todo('does not allow reentrancy');
    it.todo('does not function during a pause');

    it('works as expected', async () => {
      // Depositor 1 - deposits for self
      const depositor1Amount = lpTokenStartingBalance.div(4);

      await curveLpToken.connect(depositor1).approve(wrapper, depositor1Amount);
      const receipt1 = await wrapper.connect(depositor1).deposit(depositor1Amount);

      expect(await curveLpToken.balanceOf(depositor1)).toEqBigNumber(lpTokenStartingBalance.sub(depositor1Amount));
      expect(await wrapper.balanceOf(depositor1)).toEqBigNumber(depositor1Amount);
      expect(await wrapper.totalSupply()).toEqBigNumber(depositor1Amount);

      assertEvent(receipt1, 'Deposited', {
        amount: depositor1Amount,
        from: depositor1,
        to: depositor1,
      });

      // Time passes
      await provider.send('evm_increaseTime', [60 * 60 * 24]);
      await provider.send('evm_mine', []);

      // Depositor 2 - deposits for third party
      const depositor2Recipient = randomAddress();
      const depositor2Amount = lpTokenStartingBalance.div(2);
      expect(depositor2Amount).not.toEqBigNumber(depositor1Amount);

      await curveLpToken.connect(depositor2).approve(wrapper, depositor2Amount);
      const receipt2 = await wrapper.connect(depositor2).depositTo(depositor2Recipient, depositor2Amount);

      expect(await curveLpToken.balanceOf(depositor2)).toEqBigNumber(lpTokenStartingBalance.sub(depositor2Amount));
      expect(await wrapper.balanceOf(depositor2Recipient)).toEqBigNumber(depositor2Amount);
      expect(await wrapper.totalSupply()).toEqBigNumber(depositor1Amount.add(depositor2Amount));

      assertEvent(receipt2, 'Deposited', {
        amount: depositor2Amount,
        from: depositor2,
        to: depositor2Recipient,
      });

      // 2nd tx after time passes should be more expensive because rewards would have accrued
      expect(receipt2).toCostAround(1295815);
    });
  });

  describe('withdraw', () => {
    // These can be added to tests of the base functionality
    it.todo('does not allow reentrancy');
    it.todo('works during a pause');

    it('withdrawTo: works as expected', async () => {
      // Deposit the same amount from both depositors
      const depositAmount = lpTokenStartingBalance.div(4);
      await curveLpToken.connect(depositor1).approve(wrapper, depositAmount);
      await wrapper.connect(depositor1).deposit(depositAmount);
      await curveLpToken.connect(depositor2).approve(wrapper, depositAmount);
      await wrapper.connect(depositor2).deposit(depositAmount);

      // Depositor 1 - redeems to self
      const withdrawal1Recipient = depositor1;
      const withdrawal1Amount = depositAmount.div(4);

      const preTxWithdrawal1RecipientCurveLpTokenBalance = await curveLpToken.balanceOf(withdrawal1Recipient);
      const preTxWithdrawal1TotalSupply = await wrapper.totalSupply();

      const receipt1 = await wrapper.connect(depositor1).withdrawTo(withdrawal1Recipient, withdrawal1Amount, false);

      expect(await curveLpToken.balanceOf(withdrawal1Recipient)).toEqBigNumber(
        preTxWithdrawal1RecipientCurveLpTokenBalance.add(withdrawal1Amount),
      );
      expect(await wrapper.balanceOf(depositor1)).toEqBigNumber(depositAmount.sub(withdrawal1Amount));
      expect(await wrapper.totalSupply()).toEqBigNumber(preTxWithdrawal1TotalSupply.sub(withdrawal1Amount));

      assertEvent(receipt1, 'Withdrawn', {
        amount: withdrawal1Amount,
        caller: depositor1,
        from: depositor1,
        to: withdrawal1Recipient,
      });

      // Time passes
      await provider.send('evm_increaseTime', [60 * 60 * 24]);
      await provider.send('evm_mine', []);

      // Depositor 2 - redeems to third party
      const withdrawal2Recipient = randomAddress();
      const withdrawal2Amount = depositAmount.div(4);

      const preTxWithdrawal2RecipientCurveLpTokenBalance = await curveLpToken.balanceOf(withdrawal2Recipient);
      const preTxWithdrawal2TotalSupply = await wrapper.totalSupply();

      const receipt2 = await wrapper.connect(depositor2).withdrawTo(withdrawal2Recipient, withdrawal2Amount, false);

      expect(await curveLpToken.balanceOf(withdrawal2Recipient)).toEqBigNumber(
        preTxWithdrawal2RecipientCurveLpTokenBalance.add(withdrawal2Amount),
      );
      expect(await wrapper.balanceOf(depositor2)).toEqBigNumber(depositAmount.sub(withdrawal2Amount));
      expect(await wrapper.totalSupply()).toEqBigNumber(preTxWithdrawal2TotalSupply.sub(withdrawal2Amount));

      assertEvent(receipt2, 'Withdrawn', {
        amount: withdrawal2Amount,
        caller: depositor2,
        from: depositor2,
        to: withdrawal2Recipient,
      });

      // 2nd tx after time passes should be more expensive because rewards would have accrued
      expect(receipt2).toCostAround(1106686);
    });

    it('withdrawOnBehalf: works as expected', async () => {
      const depositAmount = lpTokenStartingBalance.div(4);
      await curveLpToken.connect(depositor1).approve(wrapper, depositAmount);
      await wrapper.connect(depositor1).deposit(depositAmount);

      // Depositor2 cannot withdraw any of depositor1's tokens
      const withdrawalAmount = 123;
      await expect(
        wrapper.connect(depositor2).withdrawToOnBehalf(depositor1, depositor2, withdrawalAmount, false),
      ).rejects.toBeReverted();

      // Give depositor2 an exact allowance for depositor1
      const initialAllowance = depositAmount.div(4);
      await wrapper.connect(depositor1).approve(depositor2, initialAllowance);

      // Depositor1 can withdraw the correct amount
      await wrapper.connect(depositor2).withdrawToOnBehalf(depositor1, depositor2, withdrawalAmount, false);

      // Allowance has decreased
      expect(await wrapper.allowance(depositor1, depositor2)).toEqBigNumber(initialAllowance.sub(withdrawalAmount));
    });

    it('withdraw: allows claiming rewards', async () => {
      // Dynamically use the reward tokens from return values in this test

      // Deposit
      const depositAmount = lpTokenStartingBalance.div(4);
      await curveLpToken.connect(depositor1).approve(wrapper, depositAmount);
      await wrapper.connect(depositor1).deposit(depositAmount);

      // Time passes
      await provider.send('evm_increaseTime', [60 * 60 * 24]);
      await provider.send('evm_mine', []);

      // Get claimRewardsFor return values
      const { rewardTokens_, claimedAmounts_ } = await wrapper.claimRewardsFor.args(depositor1).call();
      expect(rewardTokens_).toEqual(await wrapper.getRewardTokens());

      // Withdraw partial and claim rewards
      const withdrawAmount = depositAmount.div(4);
      const receipt = await wrapper.connect(depositor1).withdraw(withdrawAmount, true);

      // Assert state
      expect(await curveLpToken.balanceOf(depositor1)).toEqBigNumber(
        lpTokenStartingBalance.sub(depositAmount).add(withdrawAmount),
      );

      for (const i in rewardTokens_) {
        const token = new StandardToken(rewardTokens_[i], provider);
        // Depositor should have positive balances that match the estimated return values
        const rewardBalance = await token.balanceOf(depositor1);
        expect(rewardBalance).toBeGtBigNumber(0);
        expect(rewardBalance).toBeAroundBigNumber(claimedAmounts_[i]);

        // Wrapper should have 0 balances
        expect(await token.balanceOf(wrapper)).toEqBigNumber(0);
      }

      expect(receipt).toCostAround(1332523);
    });
  });

  describe('claimRewards', () => {
    // These two can be added to tests of the base functionality
    it.todo('does not allow reentrancy');
    it.todo('works during a pause but does not attempt to harvest rewards');

    it('works as expected (only 1 depositor)', async () => {
      // Dynamically use the reward tokens from return values in this test

      // Deposit
      const depositAmount = lpTokenStartingBalance.div(4);
      await curveLpToken.connect(depositor1).approve(wrapper, depositAmount);
      await wrapper.connect(depositor1).deposit(depositAmount);

      // Time passes
      await provider.send('evm_increaseTime', [60 * 60 * 24]);
      await provider.send('evm_mine', []);

      // Get claimRewardsFor return values
      const { rewardTokens_, claimedAmounts_ } = await wrapper.claimRewardsFor.args(depositor1).call();
      expect(rewardTokens_).toEqual(await wrapper.getRewardTokens());

      // Claim rewards
      await wrapper.connect(depositor1).claimRewardsFor(depositor1);

      for (const i in rewardTokens_) {
        const token = new StandardToken(rewardTokens_[i], provider);
        // Depositor should have positive balances that match the estimated return values
        const rewardBalance = await token.balanceOf(depositor1);
        expect(rewardBalance).toBeGtBigNumber(0);
        expect(rewardBalance).toBeAroundBigNumber(claimedAmounts_[i]);

        // Wrapper should have 0 balances
        expect(await token.balanceOf(wrapper)).toEqBigNumber(0);
      }
    });

    it('works as expected (2 depositors)', async () => {
      const crvToken = new StandardToken(fork.config.convex.crvToken, provider);
      const cvxToken = new StandardToken(fork.config.convex.cvxToken, provider);
      const ldoToken = new StandardToken(fork.config.primitives.ldo, provider);

      // Deposit different amounts from both depositors
      const depositAmount1 = lpTokenStartingBalance.div(2);
      const depositAmount2 = depositAmount1.div(2);
      await curveLpToken.connect(depositor1).approve(wrapper, depositAmount1);
      await curveLpToken.connect(depositor2).approve(wrapper, depositAmount2);
      await wrapper.connect(depositor1).deposit(depositAmount1);
      await wrapper.connect(depositor2).deposit(depositAmount2);

      // Time passes
      await provider.send('evm_increaseTime', [60 * 60 * 24]);
      await provider.send('evm_mine', []);

      // Withdraw all to stop rewards accrual
      await wrapper.connect(depositor1).withdrawTo(depositor1, depositAmount1, false);
      await wrapper.connect(depositor2).withdrawTo(depositor2, depositAmount2, false);
      expect(await wrapper.totalSupply()).toEqBigNumber(0);

      // TODO: More time passes
      // await provider.send('evm_increaseTime', [60 * 60 * 24]);
      // await provider.send('evm_mine', []);

      // Claim rewards for both depositors
      await wrapper.connect(depositor1).claimRewardsFor(depositor1);
      await wrapper.connect(depositor2).claimRewardsFor(depositor2);

      const depositor1CrvBalance = await crvToken.balanceOf(depositor1);
      const depositor1CvxBalance = await cvxToken.balanceOf(depositor1);
      const depositor1LdoBalance = await ldoToken.balanceOf(depositor1);

      const depositor2CrvBalance = await crvToken.balanceOf(depositor2);
      const depositor2CvxBalance = await cvxToken.balanceOf(depositor2);
      const depositor2LdoBalance = await ldoToken.balanceOf(depositor2);

      const totalCrv = depositor1CrvBalance.add(depositor2CrvBalance);
      const totalCvx = depositor1CvxBalance.add(depositor2CvxBalance);
      const totalLdo = depositor1LdoBalance.add(depositor2LdoBalance);

      // Depositors should have correct proportionate balances (only need to check one set)
      // TODO: make "around" number more precise
      expect(depositor1CrvBalance).toBeAroundBigNumber(
        totalCrv.mul(depositAmount1).div(depositAmount1.add(depositAmount2)),
      );
      expect(depositor1CvxBalance).toBeAroundBigNumber(
        totalCvx.mul(depositAmount1).div(depositAmount1.add(depositAmount2)),
      );
      expect(depositor1LdoBalance).toBeAroundBigNumber(
        totalLdo.mul(depositAmount1).div(depositAmount1.add(depositAmount2)),
      );

      // Wrapper should be empty of reward token balances
      // TODO: currently leaves some dust in the wrapper
      expect(await crvToken.balanceOf(wrapper)).toBeLteBigNumber(1);
      expect(await cvxToken.balanceOf(wrapper)).toBeLteBigNumber(1);
      expect(await ldoToken.balanceOf(wrapper)).toBeLteBigNumber(1);
    });
  });
});

describe('ERC20 calls', () => {
  let depositor1: SignerWithAddress, depositor2: SignerWithAddress;
  let lpTokenStartingBalance: BigNumber;
  beforeEach(async () => {
    lpTokenStartingBalance = await getAssetUnit(curveLpToken);
    [depositor1, depositor2] = fork.accounts;
    await curveLpToken.transfer(depositor1, lpTokenStartingBalance);
    await curveLpToken.transfer(depositor2, lpTokenStartingBalance);
  });

  describe('transfer', () => {
    it('happy path: 1 staker, 1 non-staker', async () => {
      // Depositor1 has a balance, randomRecipient does not
      const depositAmount = lpTokenStartingBalance.div(4);
      await curveLpToken.connect(depositor1).approve(wrapper, depositAmount);
      await wrapper.connect(depositor1).deposit(depositAmount);

      // Time passes to accrue rewards
      await provider.send('evm_increaseTime', [60 * 60 * 24]);
      await provider.send('evm_mine', []);

      // Depositor1 transfers partial balance to randomRecipient
      const transfer1Amount = depositAmount.div(2);
      const receipt = await wrapper.connect(depositor1).transfer(randomRecipient, transfer1Amount);

      // Assert transfer succeeded
      expect(await wrapper.balanceOf(randomRecipient)).toEqBigNumber(transfer1Amount);

      expect(receipt).toCostAround(622348);
    });

    it('happy path: 2 stakers', async () => {
      // Depositor1 and randomRecipient have 50/50 balances after a deposit and transfer
      const depositAmount = lpTokenStartingBalance.div(4);
      await curveLpToken.connect(depositor1).approve(wrapper, depositAmount);
      await wrapper.connect(depositor1).deposit(depositAmount);
      await wrapper.connect(depositor1).transfer(randomRecipient, depositAmount.div(2));

      // Time passes to accrue rewards
      await provider.send('evm_increaseTime', [60 * 60 * 24]);
      await provider.send('evm_mine', []);

      // Depositor1 transfers one wei to randomRecipient
      const receipt = await wrapper.connect(depositor1).transfer(randomRecipient, 1);

      expect(receipt).toCostAround(402817);
    });
  });
});
