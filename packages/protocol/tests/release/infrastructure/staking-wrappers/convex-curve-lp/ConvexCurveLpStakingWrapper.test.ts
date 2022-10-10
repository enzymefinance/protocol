import { randomAddress } from '@enzymefinance/ethers';
import type { ConvexCurveLpStakingWrapperFactory } from '@enzymefinance/protocol';
import {
  ConvexCurveLpStakingWrapperLib,
  ITestConvexBaseRewardPool,
  ITestConvexBooster,
  ITestConvexVirtualBalanceRewardPool,
  ITestStandardToken,
  ONE_DAY_IN_SECONDS,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment, SignerWithAddress } from '@enzymefinance/testutils';
import {
  assertEvent,
  deployProtocolFixture,
  getAssetUnit,
  impersonateContractSigner,
  setAccountBalance,
} from '@enzymefinance/testutils';
import type { BigNumber, BigNumberish } from 'ethers';

// TODO: This is hardcoded to handle exactly 1 extra reward token per instance. Would be nice to make this dynamic.

const randomRecipient = randomAddress();
let convexBooster: ITestConvexBooster;
let pid: BigNumberish;
let lpToken: ITestStandardToken;
let crvToken: ITestStandardToken, cvxToken: ITestStandardToken;
let extraRewardsPool: ITestConvexVirtualBalanceRewardPool,
  extraRewardsToken: ITestStandardToken,
  extraRewardsTokenWhale: SignerWithAddress;
let wrapper: ConvexCurveLpStakingWrapperLib;
let wrapperName: string, wrapperSymbol: string;
let fork: ProtocolDeployment;

const integrateeKeys = ['convex', 'aura'];
describe.each(integrateeKeys)('%s as adapter', (integrateeKey) => {
  beforeEach(async () => {
    fork = await deployProtocolFixture();

    // Integratee-specific vars
    let factory: ConvexCurveLpStakingWrapperFactory;

    switch (integrateeKey) {
      case 'convex':
        convexBooster = new ITestConvexBooster(fork.config.convex.booster, provider);
        factory = fork.deployment.convexCurveLpStakingWrapperFactory;
        crvToken = new ITestStandardToken(fork.config.convex.crvToken, provider);
        cvxToken = new ITestStandardToken(fork.config.convex.cvxToken, provider);

        pid = 25; // steth
        wrapperName = 'Enzyme Staked: Curve.fi ETH/stETH Convex Deposit';
        wrapperSymbol = 'stkcvxsteCRV';
        extraRewardsToken = new ITestStandardToken(fork.config.primitives.ldo, provider);

        // Uni v3 LDO-WETH
        extraRewardsTokenWhale = await impersonateContractSigner({
          contractAddress: '0xa3f558aebaecaf0e11ca4b2199cc5ed341edfd74',
          ethSeeder: fork.deployer,
          provider,
        });

        break;
      case 'aura':
        convexBooster = new ITestConvexBooster(fork.config.aura.booster, provider);
        factory = fork.deployment.auraBalancerV2LpStakingWrapperFactory;
        crvToken = new ITestStandardToken(fork.config.balancer.balToken, provider);
        cvxToken = new ITestStandardToken(fork.config.aura.auraToken, provider);

        pid = 3; // steth stable pool (w/ LDO rewards)
        wrapperName = 'Enzyme Staked: Balancer stETH Stable Pool Aura Deposit';
        wrapperSymbol = 'stkauraB-stETH-STABLE';
        extraRewardsToken = new ITestStandardToken(fork.config.primitives.ldo, provider);

        // Uni v3 LDO-WETH
        extraRewardsTokenWhale = await impersonateContractSigner({
          contractAddress: '0xa3f558aebaecaf0e11ca4b2199cc5ed341edfd74',
          ethSeeder: fork.deployer,
          provider,
        });

        break;

      default:
        throw 'Invalid integrateeKey';
    }

    const convexPool = new ITestConvexBaseRewardPool((await convexBooster.poolInfo(pid)).crvRewards, provider);
    extraRewardsPool = new ITestConvexVirtualBalanceRewardPool(await convexPool.extraRewards(0), provider);

    // Deploy a wrapper
    await factory.deploy(pid);
    wrapper = new ConvexCurveLpStakingWrapperLib(await factory.getWrapperForConvexPool(pid), provider);
    lpToken = new ITestStandardToken(await factory.getCurveLpTokenForWrapper(wrapper), provider);
  });

  describe('init', () => {
    it('does not allow calling twice', async () => {
      await expect(wrapper.connect(fork.deployer).init(1)).rejects.toBeRevertedWith('Initialized');
    });

    it('initializes values correctly', async () => {
      const poolInfo = await convexBooster.poolInfo(pid);

      // Assert state
      expect(await wrapper.getConvexPool()).toMatchAddress(poolInfo.crvRewards);
      expect(await wrapper.getConvexPoolId()).toEqBigNumber(pid);
      expect(await wrapper.getCurveLpToken()).toMatchAddress(poolInfo.lptoken);

      // Rewards tokens should include crv, cvx, and extra reward token
      const rewardsTokens = await wrapper.getRewardTokens();

      expect(rewardsTokens.length).toBe(3);
      expect(rewardsTokens[0]).toMatchAddress(crvToken);
      expect(rewardsTokens[1]).toMatchAddress(cvxToken);
      expect(rewardsTokens[2]).toMatchAddress(extraRewardsToken);

      // Get ERC20 token info
      expect(await wrapper.name()).toEqual(wrapperName);
      expect(await wrapper.symbol()).toEqual(wrapperSymbol);
      expect(await wrapper.decimals()).toEqBigNumber(18);
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
      lpTokenStartingBalance = await getAssetUnit(lpToken);
      [depositor1, depositor2] = fork.accounts;
      await setAccountBalance({ provider, account: depositor1, amount: lpTokenStartingBalance, token: lpToken });
      await setAccountBalance({ provider, account: depositor2, amount: lpTokenStartingBalance, token: lpToken });
    });

    describe('deposit', () => {
      // These can be added to tests of the base functionality
      it.todo('does not allow reentrancy');
      it.todo('does not function during a pause');

      it('works as expected', async () => {
        // Depositor 1 - deposits for self
        const depositor1Amount = lpTokenStartingBalance.div(4);

        await lpToken.connect(depositor1).approve(wrapper, depositor1Amount);
        const receipt1 = await wrapper.connect(depositor1).deposit(depositor1Amount);

        expect(await lpToken.balanceOf(depositor1)).toEqBigNumber(lpTokenStartingBalance.sub(depositor1Amount));
        expect(await wrapper.balanceOf(depositor1)).toEqBigNumber(depositor1Amount);
        expect(await wrapper.totalSupply()).toEqBigNumber(depositor1Amount);

        assertEvent(receipt1, 'Deposited', {
          amount: depositor1Amount,
          from: depositor1,
          to: depositor1,
        });

        // Time passes
        await provider.send('evm_increaseTime', [ONE_DAY_IN_SECONDS]);
        await provider.send('evm_mine', []);

        // Depositor 2 - deposits for third party
        const depositor2Recipient = randomAddress();
        const depositor2Amount = lpTokenStartingBalance.div(2);

        expect(depositor2Amount).not.toEqBigNumber(depositor1Amount);

        await lpToken.connect(depositor2).approve(wrapper, depositor2Amount);
        const receipt2 = await wrapper.connect(depositor2).depositTo(depositor2Recipient, depositor2Amount);

        expect(await lpToken.balanceOf(depositor2)).toEqBigNumber(lpTokenStartingBalance.sub(depositor2Amount));
        expect(await wrapper.balanceOf(depositor2Recipient)).toEqBigNumber(depositor2Amount);
        expect(await wrapper.totalSupply()).toEqBigNumber(depositor1Amount.add(depositor2Amount));

        assertEvent(receipt2, 'Deposited', {
          amount: depositor2Amount,
          from: depositor2,
          to: depositor2Recipient,
        });

        // 2nd tx after time passes should be more expensive because rewards would have accrued
        expect(receipt2).toMatchGasSnapshot(integrateeKey);
      });
    });

    describe('withdraw', () => {
      // These can be added to tests of the base functionality
      it.todo('does not allow reentrancy');
      it.todo('works during a pause');

      it('withdrawTo: works as expected', async () => {
        // Deposit the same amount from both depositors
        const depositAmount = lpTokenStartingBalance.div(4);

        await lpToken.connect(depositor1).approve(wrapper, depositAmount);
        await wrapper.connect(depositor1).deposit(depositAmount);
        await lpToken.connect(depositor2).approve(wrapper, depositAmount);
        await wrapper.connect(depositor2).deposit(depositAmount);

        // Depositor 1 - redeems to self
        const withdrawal1Recipient = depositor1;
        const withdrawal1Amount = depositAmount.div(4);

        const preTxWithdrawal1RecipientLpTokenBalance = await lpToken.balanceOf(withdrawal1Recipient);
        const preTxWithdrawal1TotalSupply = await wrapper.totalSupply();

        const receipt1 = await wrapper.connect(depositor1).withdrawTo(withdrawal1Recipient, withdrawal1Amount, false);

        expect(await lpToken.balanceOf(withdrawal1Recipient)).toEqBigNumber(
          preTxWithdrawal1RecipientLpTokenBalance.add(withdrawal1Amount),
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
        await provider.send('evm_increaseTime', [ONE_DAY_IN_SECONDS]);
        await provider.send('evm_mine', []);

        // Depositor 2 - redeems to third party
        const withdrawal2Recipient = randomAddress();
        const withdrawal2Amount = depositAmount.div(4);

        const preTxWithdrawal2RecipientLpTokenBalance = await lpToken.balanceOf(withdrawal2Recipient);
        const preTxWithdrawal2TotalSupply = await wrapper.totalSupply();

        const receipt2 = await wrapper.connect(depositor2).withdrawTo(withdrawal2Recipient, withdrawal2Amount, false);

        expect(await lpToken.balanceOf(withdrawal2Recipient)).toEqBigNumber(
          preTxWithdrawal2RecipientLpTokenBalance.add(withdrawal2Amount),
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
        expect(receipt2).toMatchGasSnapshot(integrateeKey);
      });

      it('withdrawOnBehalf: works as expected', async () => {
        const depositAmount = lpTokenStartingBalance.div(4);

        await lpToken.connect(depositor1).approve(wrapper, depositAmount);
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

        await lpToken.connect(depositor1).approve(wrapper, depositAmount);
        await wrapper.connect(depositor1).deposit(depositAmount);

        // Renew extra rewards
        await extraRewardsPoolRenewReward({
          extraRewardsPool,
          rewardToken: extraRewardsToken,
          rewardTokenAmount: (await getAssetUnit(extraRewardsToken)).mul(10000),
          rewardTokenSeeder: extraRewardsTokenWhale,
        });

        // Time passes
        await provider.send('evm_increaseTime', [ONE_DAY_IN_SECONDS]);
        await provider.send('evm_mine', []);

        // Get claimRewardsFor return values
        const { rewardTokens_, claimedAmounts_ } = await wrapper.claimRewardsFor.args(depositor1).call();

        expect(rewardTokens_).toEqual(await wrapper.getRewardTokens());

        // Withdraw partial and claim rewards
        const withdrawAmount = depositAmount.div(4);
        const receipt = await wrapper.connect(depositor1).withdraw(withdrawAmount, true);

        // Assert state
        expect(await lpToken.balanceOf(depositor1)).toEqBigNumber(
          lpTokenStartingBalance.sub(depositAmount).add(withdrawAmount),
        );

        for (const i in rewardTokens_) {
          const token = new ITestStandardToken(rewardTokens_[i], provider);
          // Depositor should have positive balances that match the estimated return values
          const rewardBalance = await token.balanceOf(depositor1);

          expect(rewardBalance).toBeGtBigNumber(0);
          expect(rewardBalance).toBeAroundBigNumber(claimedAmounts_[i]);

          // Wrapper should have 0 balances
          expect(await token.balanceOf(wrapper)).toEqBigNumber(0);
        }

        expect(receipt).toMatchGasSnapshot(integrateeKey);
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

        await lpToken.connect(depositor1).approve(wrapper, depositAmount);
        await wrapper.connect(depositor1).deposit(depositAmount);

        // Renew extra rewards
        await extraRewardsPoolRenewReward({
          extraRewardsPool,
          rewardToken: extraRewardsToken,
          rewardTokenAmount: (await getAssetUnit(extraRewardsToken)).mul(10000),
          rewardTokenSeeder: extraRewardsTokenWhale,
        });

        // Time passes
        await provider.send('evm_increaseTime', [ONE_DAY_IN_SECONDS]);
        await provider.send('evm_mine', []);

        // Get claimRewardsFor return values
        const { rewardTokens_, claimedAmounts_ } = await wrapper.claimRewardsFor.args(depositor1).call();

        expect(rewardTokens_).toEqual(await wrapper.getRewardTokens());

        // Claim rewards
        await wrapper.connect(depositor1).claimRewardsFor(depositor1);

        for (const i in rewardTokens_) {
          const token = new ITestStandardToken(rewardTokens_[i], provider);
          // Depositor should have positive balances that match the estimated return values
          const rewardBalance = await token.balanceOf(depositor1);

          expect(rewardBalance).toBeGtBigNumber(0);
          expect(rewardBalance).toBeAroundBigNumber(claimedAmounts_[i]);

          // Wrapper should have 0 balances
          expect(await token.balanceOf(wrapper)).toEqBigNumber(0);
        }
      });

      it('works as expected (2 depositors)', async () => {
        // Deposit different amounts from both depositors
        const depositAmount1 = lpTokenStartingBalance.div(2);
        const depositAmount2 = depositAmount1.div(2);

        await lpToken.connect(depositor1).approve(wrapper, depositAmount1);
        await lpToken.connect(depositor2).approve(wrapper, depositAmount2);
        await wrapper.connect(depositor1).deposit(depositAmount1);
        await wrapper.connect(depositor2).deposit(depositAmount2);

        // Renew extra rewards
        await extraRewardsPoolRenewReward({
          extraRewardsPool,
          rewardToken: extraRewardsToken,
          rewardTokenAmount: (await getAssetUnit(extraRewardsToken)).mul(10000),
          rewardTokenSeeder: extraRewardsTokenWhale,
        });

        // Time passes
        await provider.send('evm_increaseTime', [ONE_DAY_IN_SECONDS]);
        await provider.send('evm_mine', []);

        // Withdraw all to stop rewards accrual
        await wrapper.connect(depositor1).withdrawTo(depositor1, depositAmount1, false);
        await wrapper.connect(depositor2).withdrawTo(depositor2, depositAmount2, false);
        expect(await wrapper.totalSupply()).toEqBigNumber(0);

        // TODO: More time passes
        // await provider.send('evm_increaseTime', [ONE_DAY_IN_SECONDS]);
        // await provider.send('evm_mine', []);

        // Claim rewards for both depositors
        await wrapper.connect(depositor1).claimRewardsFor(depositor1);
        await wrapper.connect(depositor2).claimRewardsFor(depositor2);

        const depositor1CrvBalance = await crvToken.balanceOf(depositor1);
        const depositor1CvxBalance = await cvxToken.balanceOf(depositor1);
        const depositor1ExtraRewardsTokenBalance = await extraRewardsToken.balanceOf(depositor1);

        const depositor2CrvBalance = await crvToken.balanceOf(depositor2);
        const depositor2CvxBalance = await cvxToken.balanceOf(depositor2);
        const depositor2ExtraRewardsTokenBalance = await extraRewardsToken.balanceOf(depositor2);

        const totalCrv = depositor1CrvBalance.add(depositor2CrvBalance);
        const totalCvx = depositor1CvxBalance.add(depositor2CvxBalance);
        const totalExtraRewardsToken = depositor1ExtraRewardsTokenBalance.add(depositor2ExtraRewardsTokenBalance);

        // Depositors should have correct proportionate balances (only need to check one set)
        // TODO: make "around" number more precise
        expect(depositor1CrvBalance).toBeAroundBigNumber(
          totalCrv.mul(depositAmount1).div(depositAmount1.add(depositAmount2)),
        );
        expect(depositor1CvxBalance).toBeAroundBigNumber(
          totalCvx.mul(depositAmount1).div(depositAmount1.add(depositAmount2)),
        );
        expect(depositor1ExtraRewardsTokenBalance).toBeAroundBigNumber(
          totalExtraRewardsToken.mul(depositAmount1).div(depositAmount1.add(depositAmount2)),
        );

        // Wrapper should be empty of reward token balances
        // TODO: currently leaves some dust in the wrapper
        expect(await crvToken.balanceOf(wrapper)).toBeLteBigNumber(1);
        expect(await cvxToken.balanceOf(wrapper)).toBeLteBigNumber(1);
        expect(await extraRewardsToken.balanceOf(wrapper)).toBeLteBigNumber(1);
      });
    });
  });

  describe('ERC20 calls', () => {
    let depositor1: SignerWithAddress, depositor2: SignerWithAddress;
    let lpTokenStartingBalance: BigNumber;

    beforeEach(async () => {
      lpTokenStartingBalance = await getAssetUnit(lpToken);
      [depositor1, depositor2] = fork.accounts;
      await setAccountBalance({ provider, account: depositor1, amount: lpTokenStartingBalance, token: lpToken });
      await setAccountBalance({ provider, account: depositor2, amount: lpTokenStartingBalance, token: lpToken });
    });

    describe('transfer', () => {
      it('happy path: 1 staker, 1 non-staker', async () => {
        // Depositor1 has a balance, randomRecipient does not
        const depositAmount = lpTokenStartingBalance.div(4);

        await lpToken.connect(depositor1).approve(wrapper, depositAmount);
        await wrapper.connect(depositor1).deposit(depositAmount);

        // Renew extra rewards
        await extraRewardsPoolRenewReward({
          extraRewardsPool,
          rewardToken: extraRewardsToken,
          rewardTokenAmount: (await getAssetUnit(extraRewardsToken)).mul(10000),
          rewardTokenSeeder: extraRewardsTokenWhale,
        });

        // Time passes to accrue rewards
        await provider.send('evm_increaseTime', [ONE_DAY_IN_SECONDS]);
        await provider.send('evm_mine', []);

        // Depositor1 transfers partial balance to randomRecipient
        const transfer1Amount = depositAmount.div(2);
        const receipt = await wrapper.connect(depositor1).transfer(randomRecipient, transfer1Amount);

        // Assert transfer succeeded
        expect(await wrapper.balanceOf(randomRecipient)).toEqBigNumber(transfer1Amount);

        expect(receipt).toMatchGasSnapshot(integrateeKey);
      });

      it('happy path: 2 stakers', async () => {
        // Depositor1 and randomRecipient have 50/50 balances after a deposit and transfer
        const depositAmount = lpTokenStartingBalance.div(4);

        await lpToken.connect(depositor1).approve(wrapper, depositAmount);
        await wrapper.connect(depositor1).deposit(depositAmount);
        await wrapper.connect(depositor1).transfer(randomRecipient, depositAmount.div(2));

        // Renew extra rewards
        await extraRewardsPoolRenewReward({
          extraRewardsPool,
          rewardToken: extraRewardsToken,
          rewardTokenAmount: (await getAssetUnit(extraRewardsToken)).mul(10000),
          rewardTokenSeeder: extraRewardsTokenWhale,
        });

        // Time passes to accrue rewards
        await provider.send('evm_increaseTime', [ONE_DAY_IN_SECONDS]);
        await provider.send('evm_mine', []);

        // Depositor1 transfers one wei to randomRecipient
        const receipt = await wrapper.connect(depositor1).transfer(randomRecipient, 1);

        expect(receipt).toMatchGasSnapshot(integrateeKey);
      });
    });
  });
});

async function extraRewardsPoolRenewReward({
  extraRewardsPool,
  rewardToken,
  rewardTokenAmount,
  rewardTokenSeeder,
}: {
  extraRewardsPool: ITestConvexVirtualBalanceRewardPool;
  rewardToken: ITestStandardToken;
  rewardTokenAmount: BigNumberish;
  rewardTokenSeeder: SignerWithAddress;
}) {
  await rewardToken.connect(rewardTokenSeeder).transfer(extraRewardsPool, rewardTokenAmount);

  const operatorSigner = await impersonateContractSigner({
    contractAddress: await extraRewardsPool.operator(),
    ethSeeder: fork.deployer,
    provider,
  });

  await extraRewardsPool.connect(operatorSigner).queueNewRewards(rewardTokenAmount);
}
