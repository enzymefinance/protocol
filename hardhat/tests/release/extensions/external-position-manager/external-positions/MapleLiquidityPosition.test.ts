import type { AddressLike } from '@enzymefinance/ethers';
import { randomAddress } from '@enzymefinance/ethers';
import type { ComptrollerLib, ExternalPositionManager, MapleV1ToV2PoolMapper, VaultLib } from '@enzymefinance/protocol';
import {
  ITestMapleV2Pool,
  ITestMapleV2PoolManager,
  ITestMapleV2ProxyFactory,
  ITestMapleV2WithdrawalManager,
  ITestStandardToken,
  MapleLiquidityPositionLib,
} from '@enzymefinance/protocol';
import type { EthereumTestnetProvider, ProtocolDeployment, SignerWithAddress } from '@enzymefinance/testutils';
import {
  assertEvent,
  assertExternalPositionAssetsToReceive,
  createMapleLiquidityPosition,
  createNewFund,
  deployProtocolFixture,
  getAssetUnit,
  impersonateContractSigner,
  mapleLiquidityPositionCalcPoolV2TokenBalance,
  mapleLiquidityPositionCancelRedeemV2,
  mapleLiquidityPositionLendV2,
  mapleLiquidityPositionRedeemV2,
  mapleLiquidityPositionRequestRedeemV2,
  setAccountBalance,
  simulateMapleV1Lend,
} from '@enzymefinance/testutils';
import { BigNumber } from 'ethers';

const randomAddressValue = randomAddress();

let externalPositionManager: ExternalPositionManager, mapleV1ToV2PoolMapper: MapleV1ToV2PoolMapper;

let fundOwner: SignerWithAddress, randomUser: SignerWithAddress;
let comptrollerProxyUsed: ComptrollerLib, vaultProxyUsed: VaultLib;

let mapleLiquidityPosition: MapleLiquidityPositionLib;

let poolV2: ITestMapleV2Pool;
let poolV1Token: ITestStandardToken, poolV2Token: ITestStandardToken;
let withdrawalManager: ITestMapleV2WithdrawalManager;
let liquidityAsset: ITestStandardToken;

let liquidityAssetUnit: BigNumber;
let poolV1TokenUnit: BigNumber;

let lendAmount: BigNumber;
let seedAmount: BigNumber;

let fork: ProtocolDeployment;

async function warpToRedemptionWindow({
  provider,
  withdrawalManager,
  mapleLiquidityPosition,
}: {
  provider: EthereumTestnetProvider;
  withdrawalManager: ITestMapleV2WithdrawalManager;
  mapleLiquidityPosition: AddressLike;
}) {
  const exitCycleId = await withdrawalManager.exitCycleId(mapleLiquidityPosition);
  const { windowEnd_, windowStart_ } = await withdrawalManager.getWindowAtId(exitCycleId);
  const currentTime = BigNumber.from((await provider.getBlock('latest')).timestamp);

  if (currentTime.gt(windowEnd_)) {
    throw 'Beyond redemption window';
  } else if (currentTime.lt(windowStart_)) {
    await provider.send('evm_increaseTime', [windowStart_.sub(currentTime).toNumber()]);
  }
}

beforeEach(async () => {
  fork = await deployProtocolFixture();

  // Signers used in tests
  [fundOwner, randomUser] = fork.accounts;

  // System contracts
  externalPositionManager = fork.deployment.externalPositionManager;
  mapleV1ToV2PoolMapper = fork.deployment.mapleV1ToV2PoolMapper;

  // Maple pool vars
  poolV2 = new ITestMapleV2Pool(fork.config.maple.pools.mavenUsdc.poolV2!, provider);
  const poolManager = new ITestMapleV2PoolManager(await poolV2.manager(), provider);
  withdrawalManager = new ITestMapleV2WithdrawalManager(await poolManager.withdrawalManager(), provider);
  poolV1Token = new ITestStandardToken(fork.config.maple.pools.mavenUsdc.poolV1!, provider);
  poolV2Token = new ITestStandardToken(poolV2, provider);
  liquidityAsset = new ITestStandardToken(await poolV2.asset(), provider);

  liquidityAssetUnit = await getAssetUnit(liquidityAsset);
  poolV1TokenUnit = await getAssetUnit(poolV1Token);

  // Create fund
  const { comptrollerProxy, vaultProxy } = await createNewFund({
    denominationAsset: new ITestStandardToken(fork.config.primitives.usdc, provider),
    fundDeployer: fork.deployment.fundDeployer,
    fundOwner,
    signer: fundOwner,
  });
  vaultProxyUsed = vaultProxy;
  comptrollerProxyUsed = comptrollerProxy;

  // Create the external position for the fund
  const { externalPositionProxy } = await createMapleLiquidityPosition({
    comptrollerProxy,
    externalPositionManager,
    signer: fundOwner,
  });
  mapleLiquidityPosition = new MapleLiquidityPositionLib(externalPositionProxy, provider);

  // Seed vault with the liquidityAsset
  seedAmount = liquidityAssetUnit.mul(100);
  await setAccountBalance({ account: vaultProxyUsed, amount: seedAmount, provider, token: liquidityAsset });

  // Common user-input vars for tests
  lendAmount = seedAmount.div(11);

  // Raise the Maple pool liquidity cap well above the amount we intend to lend
  const poolDelegateSigner = await impersonateContractSigner({
    contractAddress: await poolManager.poolDelegate(),
    ethSeeder: fork.deployer,
    provider,
  });
  const currentPoolAssets = await poolManager.totalAssets();
  await poolManager.connect(poolDelegateSigner).setLiquidityCap(currentPoolAssets.add(lendAmount.mul(10000)));
});

describe('init', () => {
  it('happy path', async () => {
    const { receipt } = await createMapleLiquidityPosition({
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager,
      signer: fundOwner,
    });

    expect(receipt).toMatchInlineGasSnapshot(`461284`);
  });
});

describe('lendV2', () => {
  it('does not allow an invalid pool', async () => {
    const mockPool = await ITestMapleV2Pool.mock(fork.deployer);
    const mockPoolManager = await ITestMapleV2PoolManager.mock(fork.deployer);
    const mockFactory = await ITestMapleV2ProxyFactory.mock(fork.deployer);

    const payload = {
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager,
      externalPositionProxy: mapleLiquidityPosition,
      liquidityAssetAmount: lendAmount,
      pool: mockPool,
      signer: fundOwner,
    };

    // 1. Invalid pool:poolManager relation
    await mockPool.manager.returns(mockPoolManager);
    await mockPoolManager.pool.returns(randomAddressValue);

    await expect(mapleLiquidityPositionLendV2(payload)).rejects.toBeRevertedWith('Invalid PoolManager relation');

    // 2. Invalid poolManager:factory relation
    await mockPoolManager.pool.returns(mockPool);
    await mockPoolManager.factory.returns(mockFactory);
    await mockFactory.isInstance.returns(false);

    await expect(mapleLiquidityPositionLendV2(payload)).rejects.toBeRevertedWith('Invalid PoolManagerFactory relation');

    // 3. Invalid factory:globals relation
    await mockFactory.isInstance.returns(true);

    await expect(mapleLiquidityPositionLendV2(payload)).rejects.toBeRevertedWith('Invalid Globals relation');
  });

  it('does not allow if there are any un-migratable v1 pools', async () => {
    await simulateMapleV1Lend({
      mapleLiquidityPosition: mapleLiquidityPosition.address,
      poolV1: poolV1Token.address,
      poolV1TokenAmount: 1,
    });

    await expect(
      mapleLiquidityPositionLendV2({
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager,
        externalPositionProxy: mapleLiquidityPosition,
        liquidityAssetAmount: lendAmount,
        pool: poolV2Token,
        signer: fundOwner,
      }),
    ).rejects.toBeRevertedWith('Migration not allowed');
  });

  it('does not add an already-tracked pool', async () => {
    // Lend to the same pool twice
    await mapleLiquidityPositionLendV2({
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager,
      externalPositionProxy: mapleLiquidityPosition,
      liquidityAssetAmount: lendAmount,
      pool: poolV2Token,
      signer: fundOwner,
    });

    await mapleLiquidityPositionLendV2({
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager,
      externalPositionProxy: mapleLiquidityPosition,
      liquidityAssetAmount: lendAmount,
      pool: poolV2Token,
      signer: fundOwner,
    });

    // The pool should only be stored one time
    expect(await mapleLiquidityPosition.getUsedLendingPoolsV2()).toMatchFunctionOutput(
      mapleLiquidityPosition.getUsedLendingPoolsV2,
      [poolV2Token],
    );
  });

  it('works as expected', async () => {
    const expectedSharesReceived = await poolV2.convertToShares(lendAmount);

    const preTxVaultLiquidityAssetBalance = await liquidityAsset.balanceOf(vaultProxyUsed);

    const lendV2Receipt = await mapleLiquidityPositionLendV2({
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager,
      externalPositionProxy: mapleLiquidityPosition,
      liquidityAssetAmount: lendAmount,
      pool: poolV2Token,
      signer: fundOwner,
    });

    // No incoming assets should have been parsed in the ExternalPositionManager
    assertExternalPositionAssetsToReceive({
      receipt: lendV2Receipt,
      assets: [],
    });

    // Assert EP storage
    expect(await mapleLiquidityPosition.getUsedLendingPoolsV2()).toMatchFunctionOutput(
      mapleLiquidityPosition.getUsedLendingPoolsV2,
      [poolV2Token],
    );
    expect(await mapleLiquidityPosition.isUsedLendingPoolV2(poolV2Token)).toBe(true);

    // Assert storage update event
    assertEvent(lendV2Receipt, mapleLiquidityPosition.abi.getEvent('UsedLendingPoolV2Added'), {
      lendingPoolV2: poolV2Token.address,
    });

    // Assert asset spent and shares amount received
    expect(await liquidityAsset.balanceOf(vaultProxyUsed)).toEqBigNumber(
      preTxVaultLiquidityAssetBalance.sub(lendAmount),
    );

    // Assert the expected pool tokens were received for the pool conversion rate pre-deposit
    const poolTokenBalanceAfter = await poolV2Token.balanceOf(mapleLiquidityPosition);
    expect(poolTokenBalanceAfter).toBeAroundBigNumber(expectedSharesReceived, 1);

    // The position value should match the pool's reported exit conversion post-deposit
    const getManagedAssetsCall = await mapleLiquidityPosition.getManagedAssets.call();
    expect(getManagedAssetsCall).toMatchFunctionOutput(mapleLiquidityPosition.getManagedAssets.fragment, {
      amounts_: [await poolV2.convertToExitAssets(poolTokenBalanceAfter)],
      assets_: [liquidityAsset],
    });

    expect(lendV2Receipt).toMatchInlineGasSnapshot(`348602`);
  });
});

describe('requestRedeemV2', () => {
  let redeemPoolTokenAmount: BigNumber;

  beforeEach(async () => {
    await mapleLiquidityPositionLendV2({
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager,
      externalPositionProxy: mapleLiquidityPosition,
      liquidityAssetAmount: lendAmount,
      pool: poolV2Token,
      signer: fundOwner,
    });

    redeemPoolTokenAmount = (await poolV2Token.balanceOf(mapleLiquidityPosition)).div(11);
    expect(redeemPoolTokenAmount).toBeGtBigNumber(0);
  });

  it('does not allow an invalid pool', async () => {
    // Actual reverts tested in lend()

    await expect(
      mapleLiquidityPositionRequestRedeemV2({
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager,
        externalPositionProxy: mapleLiquidityPosition,
        poolTokenAmount: redeemPoolTokenAmount,
        pool: randomAddressValue,
        signer: fundOwner,
      }),
    ).rejects.toBeReverted();
  });

  it('does not allow if there are any un-migratable v1 pools', async () => {
    await simulateMapleV1Lend({
      mapleLiquidityPosition: mapleLiquidityPosition.address,
      poolV1: poolV1Token.address,
      poolV1TokenAmount: 1,
    });

    await expect(
      mapleLiquidityPositionRequestRedeemV2({
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager,
        externalPositionProxy: mapleLiquidityPosition,
        poolTokenAmount: redeemPoolTokenAmount,
        pool: poolV2Token,
        signer: fundOwner,
      }),
    ).rejects.toBeRevertedWith('Migration not allowed');
  });

  it('works as expected', async () => {
    const externalPositionPoolBalanceBefore = await poolV2Token.balanceOf(mapleLiquidityPosition);
    const withdrawalManagerBalanceBefore = await withdrawalManager.lockedShares(mapleLiquidityPosition);

    const requestRedeemReceipt = await mapleLiquidityPositionRequestRedeemV2({
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager,
      externalPositionProxy: mapleLiquidityPosition,
      poolTokenAmount: redeemPoolTokenAmount,
      pool: poolV2Token,
      signer: fundOwner,
    });

    // No incoming assets should have been parsed in the ExternalPositionManager
    assertExternalPositionAssetsToReceive({
      receipt: requestRedeemReceipt,
      assets: [],
    });

    // Assert that the MPT balance decreased and the escrowed shares increased by the same amount
    const externalPositionPoolBalanceAfter = await poolV2Token.balanceOf(mapleLiquidityPosition);
    expect(externalPositionPoolBalanceAfter).toEqBigNumber(
      externalPositionPoolBalanceBefore.sub(redeemPoolTokenAmount),
    );
    const withdrawalManagerBalanceAfter = await withdrawalManager.lockedShares(mapleLiquidityPosition);
    expect(withdrawalManagerBalanceAfter).toEqBigNumber(withdrawalManagerBalanceBefore.add(redeemPoolTokenAmount));

    expect(requestRedeemReceipt).toMatchInlineGasSnapshot(`279913`);
  });
});

describe('redeemV2', () => {
  beforeEach(async () => {
    await mapleLiquidityPositionLendV2({
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager,
      externalPositionProxy: mapleLiquidityPosition,
      liquidityAssetAmount: lendAmount,
      pool: poolV2Token,
      signer: fundOwner,
    });

    // Skip to the next withdrawal cycle to guarantee that we are the only parties requesting redemption.
    // Makes partial/full redemptions easier.
    const cycleDuration = (await withdrawalManager.getCurrentConfig()).cycleDuration;
    const currentTime = BigNumber.from((await provider.getBlock('latest')).timestamp);
    await provider.send('evm_increaseTime', [currentTime.add(cycleDuration).toNumber()]);
  });

  it('does not allow an invalid pool', async () => {
    // Actual reverts tested in lend()

    await expect(
      mapleLiquidityPositionRedeemV2({
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager,
        externalPositionProxy: mapleLiquidityPosition,
        poolTokenAmount: 1,
        pool: randomAddressValue,
        signer: fundOwner,
      }),
    ).rejects.toBeReverted();
  });

  it('works as expected (partial redemption)', async () => {
    const externalPositionPoolBalanceBefore = await mapleLiquidityPositionCalcPoolV2TokenBalance({
      mapleLiquidityPosition,
      poolV2Address: poolV2Token,
    });
    const vaultProxyAssetBalanceBefore = await liquidityAsset.balanceOf(vaultProxyUsed);

    const redeemPoolTokenAmount = externalPositionPoolBalanceBefore.div(11);
    expect(redeemPoolTokenAmount).toBeGtBigNumber(0);

    // Queue all desired pool tokens for redemption
    await mapleLiquidityPositionRequestRedeemV2({
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager,
      externalPositionProxy: mapleLiquidityPosition,
      poolTokenAmount: redeemPoolTokenAmount,
      pool: poolV2Token,
      signer: fundOwner,
    });

    await warpToRedemptionWindow({
      provider,
      withdrawalManager,
      mapleLiquidityPosition,
    });

    const redeemReceipt = await mapleLiquidityPositionRedeemV2({
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager,
      externalPositionProxy: mapleLiquidityPosition,
      poolTokenAmount: redeemPoolTokenAmount,
      pool: poolV2Token,
      signer: fundOwner,
    });

    // The liquidity asset should have been parsed as an incoming asset in the ExternalPositionManager
    assertExternalPositionAssetsToReceive({
      receipt: redeemReceipt,
      assets: [liquidityAsset],
    });

    // Assert EP storage.
    // After a partial redemption, the lending pool should still be tracked.
    expect(await mapleLiquidityPosition.getUsedLendingPoolsV2()).toMatchFunctionOutput(
      mapleLiquidityPosition.getUsedLendingPoolsV2,
      [poolV2Token],
    );
    expect(await mapleLiquidityPosition.isUsedLendingPoolV2(poolV2Token)).toBe(true);

    // Assert that the MPT balance decreased by the redeemed amount
    const externalPositionPoolBalanceAfter = await mapleLiquidityPositionCalcPoolV2TokenBalance({
      mapleLiquidityPosition,
      poolV2Address: poolV2Token,
    });
    expect(externalPositionPoolBalanceAfter).toEqBigNumber(
      externalPositionPoolBalanceBefore.sub(redeemPoolTokenAmount),
    );

    // Assert that the expected amount of liquidity asset was received by the vault
    const vaultProxyAssetBalanceAfter = await liquidityAsset.balanceOf(vaultProxyUsed);
    expect(vaultProxyAssetBalanceAfter).toEqBigNumber(
      vaultProxyAssetBalanceBefore.add(await poolV2.convertToExitAssets(redeemPoolTokenAmount)),
    );

    expect(redeemReceipt).toMatchInlineGasSnapshot(`293858`);
  });

  it('works as expected (full redemption)', async () => {
    const externalPositionPoolBalanceBefore = await mapleLiquidityPositionCalcPoolV2TokenBalance({
      mapleLiquidityPosition,
      poolV2Address: poolV2Token,
    });

    // Queue all desired pool tokens for redemption
    await mapleLiquidityPositionRequestRedeemV2({
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager,
      externalPositionProxy: mapleLiquidityPosition,
      poolTokenAmount: externalPositionPoolBalanceBefore,
      pool: poolV2Token,
      signer: fundOwner,
    });

    await warpToRedemptionWindow({
      provider,
      withdrawalManager,
      mapleLiquidityPosition,
    });

    const redeemReceipt = await mapleLiquidityPositionRedeemV2({
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager,
      externalPositionProxy: mapleLiquidityPosition,
      poolTokenAmount: externalPositionPoolBalanceBefore,
      pool: poolV2Token,
      signer: fundOwner,
    });

    // After a full redemption, the lending pool should no longer be tracked
    expect(await mapleLiquidityPosition.getUsedLendingPoolsV2()).toMatchFunctionOutput(
      mapleLiquidityPosition.getUsedLendingPoolsV2,
      [],
    );
    expect(await mapleLiquidityPosition.isUsedLendingPoolV2(poolV2Token)).toBe(false);

    // Assert storage update event
    assertEvent(redeemReceipt, mapleLiquidityPosition.abi.getEvent('UsedLendingPoolV2Removed'), {
      lendingPoolV2: poolV2Token,
    });
  });
});

describe('cancelRedeemV2Action', () => {
  beforeEach(async () => {
    await mapleLiquidityPositionLendV2({
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager,
      externalPositionProxy: mapleLiquidityPosition,
      liquidityAssetAmount: lendAmount,
      pool: poolV2Token,
      signer: fundOwner,
    });

    // Queue all pool tokens for redemption. The tests can then decide whether to redeem partial or full amount.
    await mapleLiquidityPositionRequestRedeemV2({
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager,
      externalPositionProxy: mapleLiquidityPosition,
      poolTokenAmount: await poolV2Token.balanceOf(mapleLiquidityPosition),
      pool: poolV2Token,
      signer: fundOwner,
    });

    await warpToRedemptionWindow({
      provider,
      withdrawalManager,
      mapleLiquidityPosition,
    });
  });

  it('does not allow an invalid pool', async () => {
    // Actual reverts tested in lend()

    await expect(
      mapleLiquidityPositionCancelRedeemV2({
        comptrollerProxy: comptrollerProxyUsed,
        externalPositionManager,
        externalPositionProxy: mapleLiquidityPosition,
        poolTokenAmount: 1,
        pool: randomAddressValue,
        signer: fundOwner,
      }),
    ).rejects.toBeReverted();
  });

  it('works as expected', async () => {
    const lockedPoolTokensBefore = await withdrawalManager.lockedShares(mapleLiquidityPosition);
    const unlockedPoolTokensBefore = await poolV2Token.balanceOf(mapleLiquidityPosition);

    const cancelPoolTokenAmount = lockedPoolTokensBefore.div(11);

    const receipt = await mapleLiquidityPositionCancelRedeemV2({
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager,
      externalPositionProxy: mapleLiquidityPosition,
      poolTokenAmount: cancelPoolTokenAmount,
      pool: poolV2Token,
      signer: fundOwner,
    });

    // Assert that the MPT balance increased and the escrowed shares decreased by the same amount
    const lockedPoolTokensAfter = await withdrawalManager.lockedShares(mapleLiquidityPosition);
    expect(lockedPoolTokensAfter).toEqBigNumber(lockedPoolTokensBefore.sub(cancelPoolTokenAmount));

    const unlockedPoolTokensAfter = await poolV2Token.balanceOf(mapleLiquidityPosition);
    expect(unlockedPoolTokensAfter).toEqBigNumber(unlockedPoolTokensBefore.add(cancelPoolTokenAmount));

    expect(receipt).toMatchInlineGasSnapshot(`262248`);
  });
});

describe('getManagedAssets', () => {
  it('does not allow a v1 pool without a snapshot after the snapshot deadline', async () => {
    await simulateMapleV1Lend({
      mapleLiquidityPosition: mapleLiquidityPosition.address,
      poolV1: poolV1Token.address,
      poolV1TokenAmount: 1,
    });

    // Freeze snapshots
    await mapleV1ToV2PoolMapper.freezeSnapshots();

    await expect(mapleLiquidityPosition.connect(fundOwner).getManagedAssets()).rejects.toBeRevertedWith(
      'No pool v1 snapshot',
    );
  });

  it('happy path: v1 pool with snapshot', async () => {
    const poolTokenAmount = lendAmount.mul(poolV1TokenUnit).div(liquidityAssetUnit);
    await simulateMapleV1Lend({
      mapleLiquidityPosition: mapleLiquidityPosition.address,
      poolV1: poolV1Token.address,
      poolV1TokenAmount: poolTokenAmount,
    });

    await mapleLiquidityPosition.connect(fundOwner).snapshotPoolTokenV1BalanceValues();

    // Since we have just entered the pool, there are no liabilities or interest to account for
    expect(await mapleLiquidityPosition.connect(fundOwner).getManagedAssets.call()).toMatchFunctionOutput(
      mapleLiquidityPosition.getManagedAssets.fragment,
      {
        amounts_: [lendAmount],
        assets_: [liquidityAsset],
      },
    );
  });

  it('happy path: v1 pool & migration allowed', async () => {
    // Seed and track v1 pool tokens
    await simulateMapleV1Lend({
      mapleLiquidityPosition: mapleLiquidityPosition.address,
      poolV1: poolV1Token.address,
      poolV1TokenAmount: poolV1TokenUnit.mul(3),
    });
    const poolTokenV1Value = (await mapleLiquidityPosition.connect(fundOwner).getManagedAssets.call()).amounts_[0];

    // Seed untracked v2 pool tokens
    await setAccountBalance({
      account: mapleLiquidityPosition,
      amount: liquidityAssetUnit.mul(10),
      provider,
      token: poolV2Token,
    });
    const poolTokenV2Value = await poolV2.convertToExitAssets(await poolV2Token.balanceOf(mapleLiquidityPosition));

    // Make sure both tokens have non-zero value and are not equal values
    expect(poolTokenV1Value).toBeGtBigNumber(0);
    expect(poolTokenV2Value).toBeGtBigNumber(0);
    expect(poolTokenV1Value).not.toEqBigNumber(poolTokenV2Value);

    // Snapshot v1 pool token value, to make clear that we are not double-counting v1 and v2 pool values
    await mapleLiquidityPosition.connect(fundOwner).snapshotPoolTokenV1BalanceValues();

    // Add the pool to the migration mapping, and allow migrations
    await mapleV1ToV2PoolMapper.allowMigration();
    await mapleV1ToV2PoolMapper.mapPools([poolV1Token], [poolV2Token]);

    // Position value should only be the v2 token value, and not include the v1 value snapshot
    expect(await mapleLiquidityPosition.connect(fundOwner).getManagedAssets.call()).toMatchFunctionOutput(
      mapleLiquidityPosition.getManagedAssets.fragment,
      {
        amounts_: [poolTokenV2Value],
        assets_: [liquidityAsset],
      },
    );

    // getManagedAssets should have triggered migration
    const receipt = await mapleLiquidityPosition.connect(fundOwner).getManagedAssets();
    assertEvent(receipt, mapleLiquidityPosition.abi.getEvent('UsedLendingPoolV2Added'), {
      lendingPoolV2: poolV2Token.address,
    });
  });

  it('happy path: v1 pool without snapshot before the snapshot deadline', async () => {
    const poolTokenAmount = lendAmount.mul(poolV1TokenUnit).div(liquidityAssetUnit);
    await simulateMapleV1Lend({
      mapleLiquidityPosition: mapleLiquidityPosition.address,
      poolV1: poolV1Token.address,
      poolV1TokenAmount: poolTokenAmount,
    });

    // Since we have just entered the pool, there are no liabilities or interest to account for
    expect(await mapleLiquidityPosition.connect(fundOwner).getManagedAssets.call()).toMatchFunctionOutput(
      mapleLiquidityPosition.getManagedAssets.fragment,
      {
        amounts_: [lendAmount],
        assets_: [liquidityAsset],
      },
    );
  });

  it('happy path: one v2 pool', async () => {
    await mapleLiquidityPositionLendV2({
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager,
      externalPositionProxy: mapleLiquidityPosition,
      liquidityAssetAmount: lendAmount,
      pool: poolV2Token,
      signer: fundOwner,
    });

    const poolV2TokenBalance = await mapleLiquidityPositionCalcPoolV2TokenBalance({
      mapleLiquidityPosition,
      poolV2Address: poolV2Token,
    });

    // The position value should match the pool's reported exit conversion post-deposit
    const preRequestRedeemManagedAssets = await mapleLiquidityPosition.getManagedAssets.call();
    expect(preRequestRedeemManagedAssets).toMatchFunctionOutput(mapleLiquidityPosition.getManagedAssets.fragment, {
      amounts_: [await poolV2.convertToExitAssets(poolV2TokenBalance)],
      assets_: [liquidityAsset],
    });

    // Request partial redemption and escrow shares
    const redeemPoolTokenAmount = (await poolV2.convertToShares(lendAmount)).div(11);
    await mapleLiquidityPositionRequestRedeemV2({
      comptrollerProxy: comptrollerProxyUsed,
      externalPositionManager,
      externalPositionProxy: mapleLiquidityPosition,
      poolTokenAmount: redeemPoolTokenAmount,
      pool: poolV2Token,
      signer: fundOwner,
    });

    // The position value should remain the same
    // For some reason, this is sometimes +/- 1 from expected in CI,
    // so validate in a more roundabout way with 1 wei of tolerance
    const finalManagedAssetsRes = await mapleLiquidityPosition.getManagedAssets.call();
    expect(finalManagedAssetsRes.assets_.length).toBe(preRequestRedeemManagedAssets.assets_.length);
    expect(finalManagedAssetsRes.assets_.length).toBe(1);
    expect(finalManagedAssetsRes.assets_[0]).toMatchAddress(preRequestRedeemManagedAssets.assets_[0]);
    expect(finalManagedAssetsRes.amounts_[0]).toBeAroundBigNumber(preRequestRedeemManagedAssets.amounts_[0], 1);

    expect(await mapleLiquidityPosition.connect(fundOwner).getManagedAssets()).toMatchInlineGasSnapshot(`127438`);
  });
});

describe('migration', () => {
  describe('migratePoolsV1ToV2', () => {
    beforeEach(async () => {
      await simulateMapleV1Lend({
        mapleLiquidityPosition: mapleLiquidityPosition.address,
        poolV1: poolV1Token.address,
        poolV1TokenAmount: 1,
      });

      // Use a random user as signer since anybody can call
      mapleLiquidityPosition = mapleLiquidityPosition.connect(randomUser);
    });

    it('requires that migration is allowed', async () => {
      // Add pool to migration mapping
      await mapleV1ToV2PoolMapper.mapPools([poolV1Token], [poolV2Token]);
      // Do not allow migrations

      await expect(mapleLiquidityPosition.migratePoolsV1ToV2()).rejects.toBeRevertedWith('Migration not allowed');
    });

    it('requires that the pool is set in the migration mapping', async () => {
      // Allow migrations
      await mapleV1ToV2PoolMapper.allowMigration();
      // Do not add pool to migration mapping

      await expect(mapleLiquidityPosition.migratePoolsV1ToV2()).rejects.toBeRevertedWith('No mapping');
    });

    it('happy path: pool in migration mapping, successful migration', async () => {
      // Allow migrations
      await mapleV1ToV2PoolMapper.allowMigration();

      // Add pool to migration mapping
      await mapleV1ToV2PoolMapper.mapPools([poolV1Token], [poolV2Token]);

      await mapleLiquidityPosition.migratePoolsV1ToV2();

      // The migration should have completed
      expect((await mapleLiquidityPosition.getUsedLendingPoolsV1()).length).toBe(0);
      expect((await mapleLiquidityPosition.getUsedLendingPoolsV2()).length).toBe(1);
      expect(await mapleLiquidityPosition.isUsedLendingPoolV2(poolV2Token)).toBe(true);
    });
  });

  describe('snapshotPoolTokenV1BalanceValues', () => {
    let poolV1TokenAmount: BigNumber;

    beforeEach(async () => {
      poolV1TokenAmount = (await getAssetUnit(poolV1Token)).mul(3);

      await simulateMapleV1Lend({
        mapleLiquidityPosition: mapleLiquidityPosition.address,
        poolV1: poolV1Token.address,
        poolV1TokenAmount,
      });

      // Use a random user as signer since anybody can call
      mapleLiquidityPosition = mapleLiquidityPosition.connect(randomUser);
    });

    it('does not allow after snapshots are frozen', async () => {
      // Freeze snapshots
      await mapleV1ToV2PoolMapper.freezeSnapshots();

      await expect(mapleLiquidityPosition.snapshotPoolTokenV1BalanceValues()).rejects.toBeRevertedWith(
        'Snapshots frozen',
      );
    });

    it('happy path', async () => {
      const poolV1TokenBalanceValue = (await mapleLiquidityPosition.getManagedAssets.call()).amounts_[0];

      const receipt = await mapleLiquidityPosition.snapshotPoolTokenV1BalanceValues();

      expect(await mapleLiquidityPosition.getPreMigrationValueSnapshotOfPoolTokenV1(poolV1Token)).toEqBigNumber(
        poolV1TokenBalanceValue,
      );

      assertEvent(receipt, mapleLiquidityPosition.abi.getEvent('PoolTokenV1PreMigrationValueSnapshotted'), {
        lendingPoolV1: poolV1Token.address,
        value: poolV1TokenBalanceValue,
      });
    });
  });
});
