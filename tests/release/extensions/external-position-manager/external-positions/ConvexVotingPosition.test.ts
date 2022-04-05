import { randomAddress } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type { ComptrollerLib, VaultLib } from '@enzymefinance/protocol';
import { ConvexVotingPositionLib, ONE_WEEK_IN_SECONDS, StandardToken } from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import {
  convexVotingPositionClaimRewards,
  convexVotingPositionDelegate,
  convexVotingPositionLock,
  convexVotingPositionRelock,
  convexVotingPositionWithdraw,
  createConvexVotingPosition,
  createNewFund,
  deployProtocolFixture,
  getAssetUnit,
  IConvexBaseRewardPool,
  IConvexCrvDepositor,
  IConvexCvxLocker,
  IConvexVlCvxExtraRewardDistribution,
  ISnapshotDelegateRegistry,
} from '@enzymefinance/testutils';
import { utils } from 'ethers';

const convexCurveDepositorAddress = '0x8014595F2AB54cD7c604B00E9fb932176fDc86Ae';
const cvxCrvAddress = '0x62B9c7356A2Dc64a1969e19C23e4f579F9810Aa7';
const randomAccount = randomAddress();
let comptrollerProxy: ComptrollerLib, vaultProxy: VaultLib;
let fundOwner: SignerWithAddress;

let fork: ProtocolDeployment;

beforeEach(async () => {
  fork = await deployProtocolFixture();
  [fundOwner] = fork.accounts;

  const newFundRes = await createNewFund({
    denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
    fundDeployer: fork.deployment.fundDeployer,
    fundOwner,
    signer: fundOwner,
  });

  comptrollerProxy = newFundRes.comptrollerProxy;
  vaultProxy = newFundRes.vaultProxy;
});

describe('init', () => {
  it('happy path', async () => {
    const { receipt } = await createConvexVotingPosition({
      comptrollerProxy,
      externalPositionManager: fork.deployment.externalPositionManager,
      signer: fundOwner,
    });

    expect(receipt).toMatchInlineGasSnapshot('509108');
  });
});

// TODO: test spendRatio inputs?
describe('actions', () => {
  let convexVotingPosition: ConvexVotingPositionLib;
  let cvx: StandardToken;

  beforeEach(async () => {
    const convexVotingPositionProxy = (
      await createConvexVotingPosition({
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        signer: fundOwner,
      })
    ).externalPositionProxy;

    convexVotingPosition = new ConvexVotingPositionLib(convexVotingPositionProxy, provider);

    cvx = new StandardToken(fork.config.convex.cvxToken, whales.cvx);

    // Seed vaults with CVX
    const cvxAssetUnit = await getAssetUnit(cvx);

    await cvx.transfer(vaultProxy, cvxAssetUnit.mul(10));
  });

  describe('Lock', () => {
    it('works as expected', async () => {
      const lockAmount = (await cvx.balanceOf(vaultProxy)).div(4);

      expect(lockAmount).toBeGtBigNumber(0);

      const receipt = await convexVotingPositionLock({
        amount: lockAmount,
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: convexVotingPosition,
        signer: fundOwner,
      });

      // Assert external position balance
      expect(await convexVotingPosition.getManagedAssets.call()).toMatchFunctionOutput(
        convexVotingPosition.getManagedAssets,
        {
          amounts_: [lockAmount],
          assets_: [cvx],
        },
      );

      // Assert vlCVX balance
      const vlCVX = new IConvexCvxLocker(fork.config.convex.vlCvx, provider);

      expect(await vlCVX.lockedBalanceOf(convexVotingPosition)).toEqBigNumber(lockAmount);

      expect(receipt).toMatchInlineGasSnapshot('301825');
    });
  });

  describe('Relock', () => {
    it('works as expected', async () => {
      const vlCVX = new IConvexCvxLocker(fork.config.convex.vlCvx, provider);

      const lockAmount = (await cvx.balanceOf(vaultProxy)).div(4);

      expect(lockAmount).toBeGtBigNumber(0);

      await convexVotingPositionLock({
        amount: lockAmount,
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: convexVotingPosition,
        signer: fundOwner,
      });

      // Warp enough time to have vlCVX unlock (16 weeks + 1 week buffer)
      await provider.send('evm_increaseTime', [ONE_WEEK_IN_SECONDS * 17]);
      await provider.send('evm_mine', []);

      // Assert that vlCVX still remain, but are unlocked
      expect(await vlCVX.lockedBalanceOf(convexVotingPosition)).toEqBigNumber(lockAmount);
      expect(await vlCVX.balanceOf(convexVotingPosition)).toEqBigNumber(0);

      const receipt = await convexVotingPositionRelock({
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: convexVotingPosition,
        signer: fundOwner,
      });

      // Warp 1 epoch to guarantee vlCVX are re-locked
      await provider.send('evm_increaseTime', [ONE_WEEK_IN_SECONDS]);
      await provider.send('evm_mine', []);

      // Assert the same balance of vlCVX is re-locked
      expect(await vlCVX.lockedBalanceOf(convexVotingPosition)).toEqBigNumber(lockAmount);
      expect(await vlCVX.balanceOf(convexVotingPosition)).toEqBigNumber(lockAmount);

      expect(receipt).toMatchInlineGasSnapshot('639992');
    });
  });

  describe('Withdraw', () => {
    it('works as expected', async () => {
      const lockAmount = (await cvx.balanceOf(vaultProxy)).div(4);

      expect(lockAmount).toBeGtBigNumber(0);

      await convexVotingPositionLock({
        amount: lockAmount,
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: convexVotingPosition,
        signer: fundOwner,
      });

      // Warp enough time to have vlCVX unlock
      await provider.send('evm_increaseTime', [ONE_WEEK_IN_SECONDS * 17]);
      await provider.send('evm_mine', []);

      const preTxVaultCvxBalance = await cvx.balanceOf(vaultProxy);

      const receipt = await convexVotingPositionWithdraw({
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: convexVotingPosition,
        signer: fundOwner,
      });

      // Assert external position balance is 0
      expect(await convexVotingPosition.getManagedAssets.call()).toMatchFunctionOutput(
        convexVotingPosition.getManagedAssets,
        {
          amounts_: [],
          assets_: [],
        },
      );

      // Assert lockAmount has returned to the vault
      expect(await cvx.balanceOf(vaultProxy)).toEqBigNumber(preTxVaultCvxBalance.add(lockAmount));

      expect(receipt).toMatchInlineGasSnapshot('328218');
    });
  });

  describe('Delegate', () => {
    it('works as expected', async () => {
      const delegateRegistry = new ISnapshotDelegateRegistry(fork.config.snapshot.delegateRegistry, provider);
      const convexSnapshotId = utils.formatBytes32String('cvx.eth');

      const delegatee = randomAccount;

      const receipt = await convexVotingPositionDelegate({
        comptrollerProxy,
        delegatee,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: convexVotingPosition,
        signer: fundOwner,
      });

      // Assert that the delegatee has been set
      expect(await delegateRegistry.delegation(convexVotingPosition, convexSnapshotId)).toMatchAddress(delegatee);

      expect(receipt).toMatchInlineGasSnapshot('131254');
    });
  });

  describe('ClaimRewards', () => {
    let cvxCrv: StandardToken;

    beforeEach(async () => {
      cvxCrv = new StandardToken(cvxCrvAddress, provider);

      const lockAmount = (await cvx.balanceOf(vaultProxy)).div(4);

      await convexVotingPositionLock({
        amount: lockAmount,
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: convexVotingPosition,
        signer: fundOwner,
      });
    });

    it('claimLockerRewards only: works as expected', async () => {
      // Warp enough time to accrue vlCVX rewards
      await provider.send('evm_increaseTime', [ONE_WEEK_IN_SECONDS]);
      await provider.send('evm_mine', []);

      const initialVaultCvxCrv = await cvxCrv.balanceOf(vaultProxy);

      // Claim vlCVX rewards only
      await convexVotingPositionClaimRewards({
        allTokensToTransfer: [cvxCrv],
        claimLockerRewards: true,
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: convexVotingPosition,
        extraRewardTokens: [], // no claim
        signer: fundOwner,
        unstakeCvxCrv: false, // no claim
        votiumClaims: [], // no claim
      });

      // Vault balance of cvxCRV should have increased
      expect(await cvxCrv.balanceOf(vaultProxy)).toBeGtBigNumber(initialVaultCvxCrv);
    });

    it('extraRewardTokens only: works as expected', async () => {
      const vlCVX = new IConvexCvxLocker(fork.config.convex.vlCvx, provider);
      const extraRewardTokenDistributor = new IConvexVlCvxExtraRewardDistribution(
        fork.config.convex.vlCvxExtraRewards,
        provider,
      );
      const extraRewardToken = new StandardToken(fork.config.primitives.usdc, whales.usdc);
      const extraRewardTokenAmount = (await getAssetUnit(extraRewardToken)).mul(100000);

      // Warp two epochs and checkpoint, so vlCVX are eligible for extra rewards
      await provider.send('evm_increaseTime', [ONE_WEEK_IN_SECONDS * 2]);
      await provider.send('evm_mine', []);
      await vlCVX.connect(fork.deployer).checkpointEpoch();

      // Add extra reward token to current epoch
      await extraRewardToken.approve(extraRewardTokenDistributor, extraRewardTokenAmount);
      await extraRewardTokenDistributor.connect(whales.usdc).addReward(extraRewardToken, extraRewardTokenAmount);

      // Warp one epoch and checkpoint so the extra rewards can be paid out
      await provider.send('evm_increaseTime', [ONE_WEEK_IN_SECONDS]);
      await provider.send('evm_mine', []);
      await vlCVX.connect(fork.deployer).checkpointEpoch();

      const initialVaultExtraRewardTokenBalance = await extraRewardToken.balanceOf(vaultProxy);

      // Claim extra reward tokens only
      await convexVotingPositionClaimRewards({
        allTokensToTransfer: [extraRewardToken],
        claimLockerRewards: false, // no claim
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: convexVotingPosition,
        extraRewardTokens: [extraRewardToken],
        signer: fundOwner,
        unstakeCvxCrv: false, // no claim
        votiumClaims: [], // no claim
      });

      expect(await extraRewardToken.balanceOf(vaultProxy)).toBeGtBigNumber(initialVaultExtraRewardTokenBalance);
    });

    it.todo('votiumClaims only: works as expected');

    it('unstakeCvxCrv only: works as expected', async () => {
      const crv = new StandardToken(fork.config.primitives.crv, whales.crv);
      const convexCrvDepositor = new IConvexCrvDepositor(convexCurveDepositorAddress, whales.crv);
      const convexCvxCrvStaking = new IConvexBaseRewardPool(fork.config.convex.cvxCrvStaking, whales.crv);

      // Convert CRV to cvxCRV
      const stakedCvxCrvAmount = (await getAssetUnit(cvxCrv)).mul(3);

      await crv.approve(convexCrvDepositor, stakedCvxCrvAmount);
      await convexCrvDepositor.deposit(stakedCvxCrvAmount, true);
      // Stake cvxCRV on behalf of the convexVotingPosition
      await cvxCrv.connect(whales.crv).approve(convexCvxCrvStaking, stakedCvxCrvAmount);
      await convexCvxCrvStaking.stakeFor(convexVotingPosition, stakedCvxCrvAmount);

      // Claim staked cvxCRV only
      await convexVotingPositionClaimRewards({
        allTokensToTransfer: [cvxCrv],
        claimLockerRewards: false, // no claim
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: convexVotingPosition,
        extraRewardTokens: [], // no claim
        signer: fundOwner,
        unstakeCvxCrv: true,
        votiumClaims: [], // no claim
      });

      expect(await cvxCrv.balanceOf(vaultProxy)).toEqBigNumber(stakedCvxCrvAmount);
    });
  });
});

describe('position value', () => {
  let convexVotingPosition: ConvexVotingPositionLib;
  let cvx: StandardToken;

  beforeEach(async () => {
    const convexVotingPositionProxy = (
      await createConvexVotingPosition({
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        signer: fundOwner,
      })
    ).externalPositionProxy;

    convexVotingPosition = new ConvexVotingPositionLib(convexVotingPositionProxy, provider);

    cvx = new StandardToken(fork.config.convex.cvxToken, whales.cvx);

    // Seed vaults with CVX
    const cvxAssetUnit = await getAssetUnit(cvx);

    await cvx.transfer(vaultProxy, cvxAssetUnit.mul(10));
  });

  describe('getManagedAssets', () => {
    it('works as expected', async () => {
      // 1. Lock for vlCVX
      const lockAmount = await cvx.balanceOf(vaultProxy);

      expect(lockAmount).toBeGtBigNumber(0);

      const receipt = await convexVotingPositionLock({
        amount: lockAmount,
        comptrollerProxy,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: convexVotingPosition,
        signer: fundOwner,
      });

      // 2. Send some CVX directly to the external position
      // (simulates CVX being sent back to EP via kickExpiredLocks())
      const kickedCvxAmount = lockAmount.mul(3);

      await cvx.transfer(convexVotingPosition, kickedCvxAmount);

      // Assert external position balance
      expect(await convexVotingPosition.getManagedAssets.call()).toMatchFunctionOutput(
        convexVotingPosition.getManagedAssets,
        {
          amounts_: [lockAmount.add(kickedCvxAmount)],
          assets_: [cvx],
        },
      );

      expect(receipt).toMatchInlineGasSnapshot('297025');
    });
  });
});
