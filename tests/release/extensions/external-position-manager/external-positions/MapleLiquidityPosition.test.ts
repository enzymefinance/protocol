import { randomAddress } from '@enzymefinance/ethers';
import type { SignerWithAddress } from '@enzymefinance/hardhat';
import type { ComptrollerLib, VaultLib } from '@enzymefinance/protocol';
import {
  ITestMapleGlobals,
  ITestMaplePool,
  MapleLiquidityPositionLib,
  ONE_DAY_IN_SECONDS,
  StandardToken,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import {
  assertEvent,
  createMapleLiquidityPosition,
  createNewFund,
  deployProtocolFixture,
  getAssetUnit,
  mapleLiquidityPositionClaimInterest,
  mapleLiquidityPositionClaimRewards,
  mapleLiquidityPositionIntendToRedeem,
  mapleLiquidityPositionLend,
  mapleLiquidityPositionLendAndStake,
  mapleLiquidityPositionRedeem,
  mapleLiquidityPositionStake,
  mapleLiquidityPositionUnstake,
  mapleLiquidityPositionUnstakeAndRedeem,
} from '@enzymefinance/testutils';
import type { BigNumber } from 'ethers';
import { utils } from 'ethers';

// Maven pool and rewards contract / liquidity asset USDC
const poolAddress = '0x6F6c8013f639979C84b756C7FC1500eB5aF18Dc4';
const rewardsContract = '0x7C57bF654Bc16B0C9080F4F75FF62876f50B8259';

const mapleGlobals = '0xc234c62c8c09687dff0d9047e40042cd166f3600';
const mplTokenAddress = '0x33349B282065b0284d756F0577FB39c158F935e6';

let mapleLiquidityPosition: MapleLiquidityPositionLib;

let comptrollerProxyUsed: ComptrollerLib;
let vaultProxyUsed: VaultLib;

let lendAmount: BigNumber;
let liquidityAsset: StandardToken;
let poolToken: StandardToken;
let seedAmount: BigNumber;
let liquidityAssetUnit: BigNumber;

let fundOwner: SignerWithAddress;

let fork: ProtocolDeployment;

beforeEach(async () => {
  fork = await deployProtocolFixture();
  [fundOwner] = fork.accounts;

  // Initialize fund and external position
  const { comptrollerProxy, vaultProxy } = await createNewFund({
    denominationAsset: new StandardToken(fork.config.primitives.usdc, provider),
    fundDeployer: fork.deployment.fundDeployer,
    fundOwner,
    signer: fundOwner,
  });

  vaultProxyUsed = vaultProxy;
  comptrollerProxyUsed = comptrollerProxy;

  liquidityAsset = new StandardToken(fork.config.primitives.usdc, whales.usdc);
  poolToken = new StandardToken(poolAddress, provider);

  liquidityAssetUnit = await getAssetUnit(liquidityAsset);

  lendAmount = liquidityAssetUnit.mul(10);
  seedAmount = liquidityAssetUnit.mul(100);

  await liquidityAsset.transfer(vaultProxyUsed, seedAmount);

  const { externalPositionProxy } = await createMapleLiquidityPosition({
    comptrollerProxy,
    externalPositionManager: fork.deployment.externalPositionManager,
    signer: fundOwner,
  });

  mapleLiquidityPosition = new MapleLiquidityPositionLib(externalPositionProxy, provider);
});

describe('init', () => {
  it('happy path', async () => {
    const { receipt } = await createMapleLiquidityPosition({
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      signer: fundOwner,
    });

    expect(receipt).toMatchInlineGasSnapshot('461284');
  });
});

describe('lend', () => {
  it('works as expected ', async () => {
    const lendReceipt = await mapleLiquidityPositionLend({
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: mapleLiquidityPosition,
      liquidityAsset,
      liquidityAssetAmount: lendAmount,
      pool: poolAddress,
      signer: fundOwner,
    });

    const getManagedAssetsCall = await mapleLiquidityPosition.getManagedAssets.call();

    expect(getManagedAssetsCall).toMatchFunctionOutput(mapleLiquidityPosition.getManagedAssets.fragment, {
      amounts_: [lendAmount],
      assets_: [liquidityAsset],
    });

    expect(await mapleLiquidityPosition.getUsedLendingPools()).toMatchFunctionOutput(
      mapleLiquidityPosition.getUsedLendingPools,
      [poolAddress],
    );
    expect(await mapleLiquidityPosition.isUsedLendingPool(poolAddress)).toBe(true);

    // Pool tokens are represented as the the liquidity token with 18 asset decimals
    // https://github.dev/maple-labs/maple-core/blob/4577df4ac7e9ffd6a23fe6550c1d6ef98c5185ea/contracts/Pool.sol#L619
    expect(await poolToken.balanceOf(mapleLiquidityPosition)).toEqBigNumber(
      lendAmount.mul(utils.parseUnits('1', 18)).div(liquidityAssetUnit),
    );

    assertEvent(lendReceipt, mapleLiquidityPosition.abi.getEvent('UsedLendingPoolAdded'), {
      lendingPool: poolAddress,
    });

    expect(lendReceipt).toMatchInlineGasSnapshot('351087');
  });

  it('reverts if the pool is not deployed from Maple factory ', async () => {
    await expect(
      mapleLiquidityPositionLend({
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: mapleLiquidityPosition,
        liquidityAsset,
        liquidityAssetAmount: 1,
        pool: randomAddress(),
        signer: fundOwner,
      }),
    ).rejects.toBeRevertedWith('Invalid pool');
  });
});

describe('lendAndStake', () => {
  it('works as expected ', async () => {
    const testMaplePool = new ITestMaplePool(poolAddress, provider);

    const custodyAllowanceBefore = await testMaplePool.custodyAllowance(mapleLiquidityPosition, rewardsContract);

    const lendAndStakeReceipt = await mapleLiquidityPositionLendAndStake({
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: mapleLiquidityPosition,
      liquidityAsset,
      liquidityAssetAmount: lendAmount,
      pool: poolAddress,
      rewardsContract,
      signer: fundOwner,
    });

    const custodyAllowanceAfter = await testMaplePool.custodyAllowance(mapleLiquidityPosition, rewardsContract);

    const getManagedAssetsCall = await mapleLiquidityPosition.getManagedAssets.call();

    expect(getManagedAssetsCall).toMatchFunctionOutput(mapleLiquidityPosition.getManagedAssets.fragment, {
      amounts_: [lendAmount],
      assets_: [liquidityAsset],
    });

    // Pool tokens are represented as the the liquidity token with 18 asset decimals
    // https://github.dev/maple-labs/maple-core/blob/4577df4ac7e9ffd6a23fe6550c1d6ef98c5185ea/contracts/Pool.sol#L619
    const stakeAmount = lendAmount.mul(utils.parseUnits('1', 18)).div(liquidityAssetUnit);

    expect(await poolToken.balanceOf(mapleLiquidityPosition)).toEqBigNumber(stakeAmount);

    expect(custodyAllowanceAfter.sub(custodyAllowanceBefore)).toEqBigNumber(stakeAmount);

    expect(lendAndStakeReceipt).toMatchInlineGasSnapshot('489630');
  });

  it('reverts if the pool or rewards contract is not deployed from a Maple factory ', async () => {
    await expect(
      mapleLiquidityPositionLendAndStake({
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: mapleLiquidityPosition,
        liquidityAsset,
        liquidityAssetAmount: 1,
        pool: randomAddress(),
        rewardsContract,
        signer: fundOwner,
      }),
    ).rejects.toBeRevertedWith('Invalid pool');

    await expect(
      mapleLiquidityPositionLendAndStake({
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: mapleLiquidityPosition,
        liquidityAsset,
        liquidityAssetAmount: 1,
        pool: poolAddress,
        rewardsContract: randomAddress(),
        signer: fundOwner,
      }),
    ).rejects.toBeRevertedWith('Invalid rewards contract');
  });
});

describe('redeem', () => {
  it('works as expected (partial redemption)', async () => {
    const redeemAmount = lendAmount.div(2);

    await mapleLiquidityPositionLend({
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: mapleLiquidityPosition,
      liquidityAsset,
      liquidityAssetAmount: lendAmount,
      pool: poolAddress,
      signer: fundOwner,
    });

    const testMaplePool = new ITestMaplePool(poolAddress, provider);
    const testMapleGlobals = new ITestMapleGlobals(mapleGlobals, provider);

    const lockupPeriod = await testMaplePool.lockupPeriod();

    await provider.send('evm_increaseTime', [lockupPeriod.toNumber() + 1]);

    const intendToRedeemReceipt = await mapleLiquidityPositionIntendToRedeem({
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: mapleLiquidityPosition,
      pool: poolAddress,
      signer: fundOwner,
    });

    // After notifying the intention to redeem, await for the cooldown period to finally redeem
    const cooldownPeriod = await testMapleGlobals.lpCooldownPeriod();

    await provider.send('evm_increaseTime', [cooldownPeriod.toNumber() + 1]);

    const redeemReceipt = await mapleLiquidityPositionRedeem({
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: mapleLiquidityPosition,
      liquidityAsset,
      liquidityAssetAmount: redeemAmount,
      pool: poolAddress,
      signer: fundOwner,
    });

    const externalPositionPoolBalanceAfter = await poolToken.balanceOf(mapleLiquidityPosition);

    const vaultProxyTokenBalanceDiff = seedAmount.sub(await liquidityAsset.balanceOf(vaultProxyUsed));

    // Pool tokens are represented as the the liquidity token with 18 asset decimals
    // https://github.dev/maple-labs/maple-core/blob/4577df4ac7e9ffd6a23fe6550c1d6ef98c5185ea/contracts/Pool.sol#L619
    expect(externalPositionPoolBalanceAfter).toEqBigNumber(
      redeemAmount.mul(await getAssetUnit(poolToken)).div(await getAssetUnit(liquidityAsset)),
    );

    expect(vaultProxyTokenBalanceDiff).toEqBigNumber(redeemAmount);

    // After a partial redemption, the lending pool should still be tracked
    expect(await mapleLiquidityPosition.getUsedLendingPools()).toMatchFunctionOutput(
      mapleLiquidityPosition.getUsedLendingPools,
      [poolAddress],
    );
    expect(await mapleLiquidityPosition.isUsedLendingPool(poolAddress)).toBe(true);

    expect(intendToRedeemReceipt).toMatchInlineGasSnapshot('136982');
    expect(redeemReceipt).toMatchInlineGasSnapshot('238144');
  });

  it('works as expected (full redemption)', async () => {
    const redeemAmount = lendAmount;

    await mapleLiquidityPositionLend({
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: mapleLiquidityPosition,
      liquidityAsset,
      liquidityAssetAmount: lendAmount,
      pool: poolAddress,
      signer: fundOwner,
    });

    const testMaplePool = new ITestMaplePool(poolAddress, provider);
    const testMapleGlobals = new ITestMapleGlobals(mapleGlobals, provider);

    const lockupPeriod = await testMaplePool.lockupPeriod();

    await provider.send('evm_increaseTime', [lockupPeriod.toNumber() + 1]);

    await mapleLiquidityPositionIntendToRedeem({
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: mapleLiquidityPosition,
      pool: poolAddress,
      signer: fundOwner,
    });

    // After notifying the intention to redeem, await for the cooldown period to finally redeem
    const cooldownPeriod = await testMapleGlobals.lpCooldownPeriod();

    await provider.send('evm_increaseTime', [cooldownPeriod.toNumber() + 1]);

    const redeemReceipt = await mapleLiquidityPositionRedeem({
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: mapleLiquidityPosition,
      liquidityAsset,
      liquidityAssetAmount: redeemAmount,
      pool: poolAddress,
      signer: fundOwner,
    });

    // After a full redemption, the lending pool should no longer be tracked
    expect(await mapleLiquidityPosition.getUsedLendingPools()).toMatchFunctionOutput(
      mapleLiquidityPosition.getUsedLendingPools,
      [],
    );
    expect(await mapleLiquidityPosition.isUsedLendingPool(poolAddress)).toBe(false);

    assertEvent(redeemReceipt, mapleLiquidityPosition.abi.getEvent('UsedLendingPoolRemoved'), {
      lendingPool: poolAddress,
    });

    // Other assertions are made in the partial redemption test above
  });

  it('reverts if the pool is not deployed from Maple factory ', async () => {
    await expect(
      mapleLiquidityPositionIntendToRedeem({
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: mapleLiquidityPosition,
        pool: randomAddress(),
        signer: fundOwner,
      }),
    ).rejects.toBeRevertedWith('Invalid pool');

    await expect(
      mapleLiquidityPositionRedeem({
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: mapleLiquidityPosition,
        liquidityAsset,
        liquidityAssetAmount: 1,
        pool: randomAddress(),
        signer: fundOwner,
      }),
    ).rejects.toBeRevertedWith('Invalid pool');
  });
});

describe('stake', () => {
  it('works as expected', async () => {
    const stakeAmount = 123;

    await mapleLiquidityPositionLend({
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: mapleLiquidityPosition,
      liquidityAsset,
      liquidityAssetAmount: lendAmount,
      pool: poolAddress,
      signer: fundOwner,
    });

    const testMaplePool = new ITestMaplePool(poolAddress, provider);

    const externalPositionPoolBalanceBefore = await poolToken.balanceOf(mapleLiquidityPosition);
    const custodyAllowanceBefore = await testMaplePool.custodyAllowance(mapleLiquidityPosition, rewardsContract);

    const stakeReceipt = await mapleLiquidityPositionStake({
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: mapleLiquidityPosition,
      pool: poolAddress,
      poolTokenAmount: stakeAmount,
      rewardsContract,
      signer: fundOwner,
    });

    const externalPositionPoolBalanceAfter = await poolToken.balanceOf(mapleLiquidityPosition);
    const custodyAllowanceAfter = await testMaplePool.custodyAllowance(mapleLiquidityPosition, rewardsContract);

    expect(custodyAllowanceAfter.sub(custodyAllowanceBefore)).toEqBigNumber(stakeAmount);

    // Pool token balance should not change
    expect(externalPositionPoolBalanceAfter).toEqBigNumber(externalPositionPoolBalanceBefore);

    expect(stakeReceipt).toMatchInlineGasSnapshot('251372');
  });

  it('reverts if the pool or rewardsContract is not deployed from Maple factory ', async () => {
    await expect(
      mapleLiquidityPositionStake({
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: mapleLiquidityPosition,
        pool: randomAddress(),
        poolTokenAmount: 1,
        rewardsContract,
        signer: fundOwner,
      }),
    ).rejects.toBeRevertedWith('Invalid pool');

    await expect(
      mapleLiquidityPositionStake({
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: mapleLiquidityPosition,
        pool: poolAddress,
        poolTokenAmount: 1,
        rewardsContract: randomAddress(),
        signer: fundOwner,
      }),
    ).rejects.toBeRevertedWith('Invalid rewards contract');
  });
});

describe('unstake', () => {
  it('works as expected', async () => {
    const stakeAmount = 123;

    await mapleLiquidityPositionLend({
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: mapleLiquidityPosition,
      liquidityAsset,
      liquidityAssetAmount: lendAmount,
      pool: poolAddress,
      signer: fundOwner,
    });

    await mapleLiquidityPositionStake({
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: mapleLiquidityPosition,
      pool: poolAddress,
      poolTokenAmount: stakeAmount,
      rewardsContract,
      signer: fundOwner,
    });

    const testMaplePool = new ITestMaplePool(poolAddress, provider);

    const custodyAllowanceBefore = await testMaplePool.custodyAllowance(mapleLiquidityPosition, rewardsContract);
    const externalPositionPoolBalanceBefore = await poolToken.balanceOf(mapleLiquidityPosition);

    const unstakeReceipt = await mapleLiquidityPositionUnstake({
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: mapleLiquidityPosition,
      poolTokenAmount: stakeAmount,
      rewardsContract,
      signer: fundOwner,
    });

    const custodyAllowanceAfter = await testMaplePool.custodyAllowance(mapleLiquidityPosition, rewardsContract);
    const externalPositionPoolBalanceAfter = await poolToken.balanceOf(mapleLiquidityPosition);

    // Pool token balance should not change
    expect(externalPositionPoolBalanceAfter).toEqBigNumber(externalPositionPoolBalanceBefore);
    expect(custodyAllowanceBefore.sub(custodyAllowanceAfter)).toEqBigNumber(stakeAmount);

    expect(unstakeReceipt).toMatchInlineGasSnapshot('161137');
  });

  it('reverts if the rewardsContract is not deployed from Maple factory', async () => {
    await expect(
      mapleLiquidityPositionUnstake({
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: mapleLiquidityPosition,
        poolTokenAmount: 1,
        rewardsContract: randomAddress(),
        signer: fundOwner,
      }),
    ).rejects.toBeRevertedWith('Invalid rewards contract');
  });
});

describe('unstakeAndRedeem', () => {
  it('works as expected', async () => {
    const stakeAmount = lendAmount.mul(utils.parseUnits('1', 18)).div(liquidityAssetUnit);

    const unstakeAndRedeemAmount = stakeAmount.div(2);

    await mapleLiquidityPositionLendAndStake({
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: mapleLiquidityPosition,
      liquidityAsset,
      liquidityAssetAmount: lendAmount,
      pool: poolAddress,
      rewardsContract,
      signer: fundOwner,
    });

    const testMaplePool = new ITestMaplePool(poolAddress, provider);
    const testMapleGlobals = new ITestMapleGlobals(mapleGlobals, provider);

    const cooldownPeriod = await testMapleGlobals.lpCooldownPeriod();
    const lockupPeriod = await testMaplePool.lockupPeriod();

    await provider.send('evm_increaseTime', [lockupPeriod.toNumber() + 1]);

    await mapleLiquidityPositionIntendToRedeem({
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: mapleLiquidityPosition,
      pool: poolAddress,
      signer: fundOwner,
    });

    await provider.send('evm_increaseTime', [cooldownPeriod.toNumber() + 1]);

    const vaultProxyLiquidityAssetBalanceBefore = await liquidityAsset.balanceOf(vaultProxyUsed);
    const custodyAllowanceBefore = await testMaplePool.custodyAllowance(mapleLiquidityPosition, rewardsContract);
    const externalPositionPoolBalanceBefore = await poolToken.balanceOf(mapleLiquidityPosition);

    const unstakeAndRedeemReceipt = await mapleLiquidityPositionUnstakeAndRedeem({
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: mapleLiquidityPosition,
      pool: poolAddress,
      poolTokenAmount: unstakeAndRedeemAmount,
      rewardsContract,
      signer: fundOwner,
    });

    const vaultProxyLiquidityAssetBalanceAfter = await liquidityAsset.balanceOf(vaultProxyUsed);
    const custodyAllowanceAfter = await testMaplePool.custodyAllowance(mapleLiquidityPosition, rewardsContract);
    const externalPositionPoolBalanceAfter = await poolToken.balanceOf(mapleLiquidityPosition);

    const liquidityAssetAmount = unstakeAndRedeemAmount.mul(liquidityAssetUnit).div(utils.parseUnits('1', 18));

    expect(vaultProxyLiquidityAssetBalanceAfter.sub(vaultProxyLiquidityAssetBalanceBefore)).toEqBigNumber(
      liquidityAssetAmount,
    );
    expect(externalPositionPoolBalanceBefore.sub(externalPositionPoolBalanceAfter)).toEqBigNumber(
      unstakeAndRedeemAmount,
    );
    expect(custodyAllowanceBefore.sub(custodyAllowanceAfter)).toEqBigNumber(unstakeAndRedeemAmount);

    expect(unstakeAndRedeemReceipt).toMatchInlineGasSnapshot('330709');
  });

  it('reverts if the pool or rewardsContract is not deployed from Maple factory', async () => {
    await expect(
      mapleLiquidityPositionUnstakeAndRedeem({
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: mapleLiquidityPosition,
        pool: randomAddress(),
        poolTokenAmount: 1,
        rewardsContract,
        signer: fundOwner,
      }),
    ).rejects.toBeRevertedWith('Invalid pool');

    await expect(
      mapleLiquidityPositionUnstakeAndRedeem({
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: mapleLiquidityPosition,
        pool: poolAddress,
        poolTokenAmount: 1,
        rewardsContract: randomAddress(),
        signer: fundOwner,
      }),
    ).rejects.toBeRevertedWith('Invalid rewards contract');
  });
});

describe('claimInterest', () => {
  it('works as expected', async () => {
    await mapleLiquidityPositionLend({
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: mapleLiquidityPosition,
      liquidityAsset,
      liquidityAssetAmount: lendAmount,
      pool: poolAddress,
      signer: fundOwner,
    });

    const claimInterestReceipt = await mapleLiquidityPositionClaimInterest({
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: mapleLiquidityPosition,
      pool: poolAddress,
      signer: fundOwner,
    });

    const maplePool = new ITestMaplePool(poolAddress, provider);

    // Assert that expected external contract function was called
    expect(maplePool.withdrawFunds).toHaveBeenCalledOnContract();

    // Not possible to simply simulate a >0 interest since that would require doing a loan payment
    expect(claimInterestReceipt).toMatchInlineGasSnapshot('163148');
  });

  it('reverts if the pool is not deployed from Maple factory ', async () => {
    await expect(
      mapleLiquidityPositionClaimInterest({
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: mapleLiquidityPosition,
        pool: randomAddress(),
        signer: fundOwner,
      }),
    ).rejects.toBeRevertedWith('Invalid pool');
  });
});

describe('claimRewards', () => {
  it('works as expected', async () => {
    const mplToken = new StandardToken(mplTokenAddress, provider);

    await mapleLiquidityPositionLend({
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: mapleLiquidityPosition,
      liquidityAsset,
      liquidityAssetAmount: lendAmount,
      pool: poolAddress,
      signer: fundOwner,
    });

    await mapleLiquidityPositionStake({
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: mapleLiquidityPosition,
      pool: poolAddress,
      poolTokenAmount: lendAmount,
      rewardsContract,
      signer: fundOwner,
    });

    await provider.send('evm_increaseTime', [ONE_DAY_IN_SECONDS]);

    const mplBalanceBefore = await mplToken.balanceOf.args(vaultProxyUsed).call();

    const claimReceipt = await mapleLiquidityPositionClaimRewards({
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager: fork.deployment.externalPositionManager,
      externalPositionProxy: mapleLiquidityPosition,
      rewardsContract,
      signer: fundOwner,
    });

    const mplBalanceAfter = await mplToken.balanceOf.args(vaultProxyUsed).call();

    expect(mplBalanceAfter).toBeGtBigNumber(mplBalanceBefore);
    expect(claimReceipt).toMatchInlineGasSnapshot('204160');
  });

  it('reverts if the rewardsContract is not deployed from Maple factory ', async () => {
    await expect(
      mapleLiquidityPositionClaimRewards({
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager: fork.deployment.externalPositionManager,
        externalPositionProxy: mapleLiquidityPosition,
        rewardsContract: randomAddress(),
        signer: fundOwner,
      }),
    ).rejects.toBeRevertedWith('Invalid rewards contract');
  });
});
