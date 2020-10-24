import {
  EthereumTestnetProvider,
  MockContract,
} from '@crestproject/crestproject';
import { assertEvent, assertNoEvent, StandardToken } from '@melonproject/utils';
import { BigNumber, BigNumberish, BytesLike, constants, utils } from 'ethers';
import { defaultTestDeployment } from '../../../../';
import {
  ComptrollerLib,
  FeeManager,
  PerformanceFee,
  VaultLib,
} from '../../../../utils/contracts';
import {
  feeHooks,
  feeSettlementTypes,
  performanceFeeConfigArgs,
  performanceFeeSharesDue,
} from '../../../utils';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(
    provider,
  );

  // Mock a FeeManager
  const mockFeeManager = await FeeManager.mock(config.deployer);
  await mockFeeManager.getFeeSharesOutstandingForFund.returns(0);

  // Create standalone PerformanceFee
  const standalonePerformanceFee = await PerformanceFee.deploy(
    config.deployer,
    mockFeeManager,
  );

  // Mock a denomination asset
  const mockDenominationAsset = await StandardToken.mock(config.deployer);
  await mockDenominationAsset.decimals.returns(18);

  // Mock a VaultProxy
  const mockVaultProxy = await VaultLib.mock(config.deployer);
  await mockVaultProxy.totalSupply.returns(0);

  // Mock a ComptrollerProxy
  const mockComptrollerProxy = await ComptrollerLib.mock(config.deployer);
  await mockComptrollerProxy.calcGav.returns(0);
  await mockComptrollerProxy.calcGrossShareValue.returns(utils.parseEther('1'));
  await mockComptrollerProxy.getDenominationAsset.returns(
    mockDenominationAsset,
  );
  await mockComptrollerProxy.getVaultProxy.returns(mockVaultProxy.address);

  // Add fee settings for ComptrollerProxy
  const performanceFeeRate = utils.parseEther('.1'); // 10%
  const performanceFeePeriod = BigNumber.from(60 * 60 * 24 * 365); // 365 days
  const performanceFeeConfig = await performanceFeeConfigArgs({
    rate: performanceFeeRate,
    period: performanceFeePeriod,
  });
  await mockFeeManager.forward(
    standalonePerformanceFee.addFundSettings,
    mockComptrollerProxy,
    performanceFeeConfig,
  );

  return {
    accounts,
    config,
    deployment,
    performanceFeeRate,
    performanceFeePeriod,
    mockComptrollerProxy,
    mockFeeManager,
    mockVaultProxy,
    standalonePerformanceFee,
  };
}

async function activateWithInitialValues({
  mockFeeManager,
  mockComptrollerProxy,
  mockVaultProxy,
  performanceFee,
  gav = utils.parseEther('1'),
  totalSharesSupply = utils.parseEther('1'),
}: {
  mockFeeManager: MockContract<FeeManager>;
  mockComptrollerProxy: MockContract<ComptrollerLib>;
  mockVaultProxy: MockContract<VaultLib>;
  performanceFee: PerformanceFee;
  gav?: BigNumberish;
  totalSharesSupply?: BigNumberish;
}) {
  await mockComptrollerProxy.calcGav.returns(gav);
  await mockVaultProxy.totalSupply.returns(totalSharesSupply);
  await mockComptrollerProxy.calcGrossShareValue.returns(
    BigNumber.from(gav).mul(utils.parseEther('1')).div(totalSharesSupply),
  );
  const activateTx = mockFeeManager.forward(
    performanceFee.activateForFund,
    mockComptrollerProxy,
    mockVaultProxy,
  );
  await expect(activateTx).resolves.toBeReceipt();

  return activateTx;
}

async function assertAdjustedPerformance({
  mockFeeManager,
  mockComptrollerProxy,
  mockVaultProxy,
  performanceFee,
  nextGav,
  feeHook = feeHooks.Continuous,
  settlementData = constants.HashZero,
}: {
  mockFeeManager: MockContract<FeeManager>;
  mockComptrollerProxy: MockContract<ComptrollerLib>;
  mockVaultProxy: MockContract<VaultLib>;
  performanceFee: PerformanceFee;
  nextGav: BigNumberish;
  feeHook?: feeHooks;
  settlementData?: BytesLike;
}) {
  // Change the share price by altering the gav
  const prevTotalSharesSupply = await mockVaultProxy.totalSupply();
  await mockComptrollerProxy.calcGav.returns(nextGav);
  await mockComptrollerProxy.calcGrossShareValue.returns(
    BigNumber.from(nextGav)
      .mul(utils.parseEther('1'))
      .div(prevTotalSharesSupply),
  );

  // Calculate expected performance results for next settlement
  const feeInfo = await performanceFee.getFeeInfoForFund(mockComptrollerProxy);
  const prevSharesOutstanding = await mockFeeManager.getFeeSharesOutstandingForFund(
    mockComptrollerProxy,
    performanceFee,
  );
  const {
    nextAggregateValueDue,
    nextSharePrice,
    sharesDue,
  } = performanceFeeSharesDue({
    rate: feeInfo.rate,
    totalSharesSupply: prevTotalSharesSupply,
    sharesOutstanding: prevSharesOutstanding,
    gav: nextGav,
    highWaterMark: feeInfo.highWaterMark,
    prevSharePrice: feeInfo.lastSharePrice,
    prevAggregateValueDue: feeInfo.aggregateValueDue,
  });

  // Determine fee settlement type
  let feeSettlementType = feeSettlementTypes.None;
  if (sharesDue.gt(0)) {
    feeSettlementType = feeSettlementTypes.MintSharesOutstanding;
  } else if (sharesDue.lt(0)) {
    feeSettlementType = feeSettlementTypes.BurnSharesOutstanding;
  }

  // settle.call() to assert return values and get the sharesOutstanding
  const settleCall = performanceFee.settle
    .args(mockComptrollerProxy, mockVaultProxy, feeHook, settlementData)
    .from(mockFeeManager.address)
    .call();
  await expect(settleCall).resolves.toMatchObject({
    0: feeSettlementType,
    1: constants.AddressZero,
    2: sharesDue.abs(),
  });

  // Execute settle() tx
  const settleTx = mockFeeManager.forward(
    performanceFee.settle,
    mockComptrollerProxy,
    mockVaultProxy,
    feeHook,
    settlementData,
  );
  await expect(settleTx).resolves.toBeReceipt();

  // Assert event
  await assertEvent(settleTx, 'PerformanceUpdated', {
    comptrollerProxy: mockComptrollerProxy.address,
    prevSharePrice: feeInfo.lastSharePrice,
    nextSharePrice,
    prevAggregateValueDue: feeInfo.aggregateValueDue,
    nextAggregateValueDue,
    sharesOutstandingDiff: sharesDue,
  });

  // Set sharesOutstanding and new shares total supply
  await mockFeeManager.getFeeSharesOutstandingForFund
    .given(mockComptrollerProxy, performanceFee)
    .returns(prevSharesOutstanding.add(sharesDue));
  await mockVaultProxy.totalSupply.returns(
    prevTotalSharesSupply.add(sharesDue),
  );

  return { feeSettlementType, settleTx };
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      deployment: { feeManager, performanceFee },
    } = await provider.snapshot(snapshot);

    const getFeeManagerCall = performanceFee.getFeeManager();
    await expect(getFeeManagerCall).resolves.toBe(feeManager.address);

    // Implements expected hooks
    const implementedHooksCall = performanceFee.implementedHooks();
    await expect(implementedHooksCall).resolves.toMatchObject([
      feeHooks.Continuous,
      feeHooks.PreBuyShares,
      feeHooks.PreRedeemShares,
    ]);
  });
});

describe('addFundSettings', () => {
  it('can only be called by the FeeManager', async () => {
    const {
      performanceFeePeriod,
      performanceFeeRate,
      mockComptrollerProxy,
      standalonePerformanceFee,
    } = await provider.snapshot(snapshot);

    const performanceFeeConfig = await performanceFeeConfigArgs({
      rate: performanceFeeRate,
      period: performanceFeePeriod,
    });
    const addFundSettingsTx = standalonePerformanceFee.addFundSettings(
      mockComptrollerProxy,
      performanceFeeConfig,
    );

    await expect(addFundSettingsTx).rejects.toBeRevertedWith(
      'Only the FeeManger can make this call',
    );
  });

  it('correctly handles valid call', async () => {
    const {
      performanceFeePeriod,
      performanceFeeRate,
      mockComptrollerProxy,
      mockFeeManager,
      standalonePerformanceFee,
    } = await provider.snapshot(snapshot);

    const performanceFeeConfig = await performanceFeeConfigArgs({
      rate: performanceFeeRate,
      period: performanceFeePeriod,
    });
    const addFundSettingsTx = mockFeeManager.forward(
      standalonePerformanceFee.addFundSettings,
      mockComptrollerProxy,
      performanceFeeConfig,
    );
    await expect(addFundSettingsTx).resolves.toBeReceipt();

    // Assert state
    const getFeeInfoForFundCall = standalonePerformanceFee.getFeeInfoForFund(
      mockComptrollerProxy,
    );
    await expect(getFeeInfoForFundCall).resolves.toMatchObject({
      rate: performanceFeeRate,
      period: performanceFeePeriod,
      activated: BigNumber.from(0),
      lastPaid: BigNumber.from(0),
      highWaterMark: BigNumber.from(0),
      lastSharePrice: BigNumber.from(0),
      aggregateValueDue: BigNumber.from(0),
    });

    // Assert correct event was emitted
    await assertEvent(addFundSettingsTx, 'FundSettingsAdded', {
      comptrollerProxy: mockComptrollerProxy.address,
      rate: performanceFeeRate,
      period: performanceFeePeriod,
    });
  });
});

describe('activateForFund', () => {
  it('can only be called by the FeeManager', async () => {
    const {
      mockComptrollerProxy,
      mockVaultProxy,
      standalonePerformanceFee,
    } = await provider.snapshot(snapshot);

    const activateTx = standalonePerformanceFee.activateForFund(
      mockComptrollerProxy,
      mockVaultProxy,
    );
    await expect(activateTx).rejects.toBeRevertedWith(
      'Only the FeeManger can make this call',
    );
  });

  it('correctly handles valid call', async () => {
    const {
      mockComptrollerProxy,
      mockFeeManager,
      mockVaultProxy,
      performanceFeePeriod,
      performanceFeeRate,
      standalonePerformanceFee,
    } = await provider.snapshot(snapshot);

    // Set grossShareValue to an arbitrary value
    const grossShareValue = utils.parseEther('5');
    await mockComptrollerProxy.calcGrossShareValue.returns(grossShareValue);

    // Activate fund
    const activateTx = mockFeeManager.forward(
      standalonePerformanceFee.activateForFund,
      mockComptrollerProxy,
      mockVaultProxy,
    );
    await expect(activateTx).resolves.toBeReceipt();
    const activationTimestamp = (await provider.getBlock('latest')).timestamp;

    // Assert state
    const getFeeInfoForFundCall = standalonePerformanceFee.getFeeInfoForFund(
      mockComptrollerProxy,
    );
    await expect(getFeeInfoForFundCall).resolves.toMatchObject({
      rate: performanceFeeRate,
      period: performanceFeePeriod,
      activated: BigNumber.from(activationTimestamp),
      lastPaid: BigNumber.from(0),
      highWaterMark: grossShareValue,
      lastSharePrice: grossShareValue,
      aggregateValueDue: BigNumber.from(0),
    });

    // Assert event
    await assertEvent(activateTx, 'ActivatedForFund', {
      comptrollerProxy: mockComptrollerProxy.address,
      highWaterMark: grossShareValue,
    });
  });
});

describe('payout', () => {
  it('can only be called by the FeeManager', async () => {
    const {
      mockComptrollerProxy,
      mockVaultProxy,
      standalonePerformanceFee,
    } = await provider.snapshot(snapshot);

    const activateTx = standalonePerformanceFee.payout(
      mockComptrollerProxy,
      mockVaultProxy,
    );
    await expect(activateTx).rejects.toBeRevertedWith(
      'Only the FeeManger can make this call',
    );
  });

  it('correctly handles a valid call (HWM has not increased)', async () => {
    const {
      mockComptrollerProxy,
      mockFeeManager,
      mockVaultProxy,
      performanceFeePeriod,
      standalonePerformanceFee: performanceFee,
    } = await provider.snapshot(snapshot);

    await activateWithInitialValues({
      mockFeeManager,
      mockComptrollerProxy,
      mockVaultProxy,
      performanceFee,
    });

    const feeInfoPrePayout = await performanceFee.getFeeInfoForFund(
      mockComptrollerProxy,
    );

    // Warp to the end of the period
    await provider.send('evm_increaseTime', [performanceFeePeriod.toNumber()]);
    await provider.send('evm_mine', []);

    // call() function to assert return value
    const payoutCall = performanceFee.payout
      .args(mockComptrollerProxy, mockVaultProxy)
      .from(mockFeeManager.address)
      .call();
    await expect(payoutCall).resolves.toBe(false);

    // send() function
    const payoutTx = mockFeeManager.forward(
      performanceFee.payout,
      mockComptrollerProxy,
      mockVaultProxy,
    );
    await expect(payoutTx).resolves.toBeReceipt();
    const payoutTimestamp = (await provider.getBlock('latest')).timestamp;

    // Assert state
    const getFeeInfoForFundCall = performanceFee.getFeeInfoForFund(
      mockComptrollerProxy,
    );
    await expect(getFeeInfoForFundCall).resolves.toMatchObject({
      rate: feeInfoPrePayout.rate,
      period: feeInfoPrePayout.period,
      activated: feeInfoPrePayout.activated,
      lastPaid: BigNumber.from(payoutTimestamp), // updated
      highWaterMark: feeInfoPrePayout.highWaterMark,
      lastSharePrice: feeInfoPrePayout.lastSharePrice,
      aggregateValueDue: feeInfoPrePayout.aggregateValueDue,
    });

    // Assert event
    await assertEvent(payoutTx, 'PaidOut', {
      comptrollerProxy: mockComptrollerProxy.address,
      prevHighWaterMark: feeInfoPrePayout.highWaterMark,
      nextHighWaterMark: feeInfoPrePayout.highWaterMark,
    });
  });

  it('correctly handles a valid call (HWM has increased)', async () => {
    const {
      mockComptrollerProxy,
      mockFeeManager,
      mockVaultProxy,
      performanceFeePeriod,
      standalonePerformanceFee: performanceFee,
    } = await provider.snapshot(snapshot);

    await activateWithInitialValues({
      mockFeeManager,
      mockComptrollerProxy,
      mockVaultProxy,
      performanceFee,
    });

    const initialSharePrice = await mockComptrollerProxy.calcGrossShareValue.call();

    // Raise next high water mark by increasing price
    await assertAdjustedPerformance({
      mockFeeManager,
      mockComptrollerProxy,
      mockVaultProxy,
      nextGav: utils.parseEther('1.1'),
      performanceFee,
    });

    const feeInfoPrePayout = await performanceFee.getFeeInfoForFund(
      mockComptrollerProxy,
    );

    // Warp to the end of the period
    await provider.send('evm_increaseTime', [performanceFeePeriod.toNumber()]);
    await provider.send('evm_mine', []);

    // call() function to assert return value
    const payoutCall = performanceFee.payout
      .args(mockComptrollerProxy, mockVaultProxy)
      .from(mockFeeManager.address)
      .call();
    await expect(payoutCall).resolves.toBe(true);

    // send() function
    const payoutTx = mockFeeManager.forward(
      performanceFee.payout,
      mockComptrollerProxy,
      mockVaultProxy,
    );
    await expect(payoutTx).resolves.toBeReceipt();
    const payoutTimestamp = (await provider.getBlock('latest')).timestamp;

    // Assert state
    const getFeeInfoForFundCall = performanceFee.getFeeInfoForFund(
      mockComptrollerProxy,
    );
    await expect(getFeeInfoForFundCall).resolves.toMatchObject({
      rate: feeInfoPrePayout.rate,
      period: feeInfoPrePayout.period,
      activated: feeInfoPrePayout.activated,
      lastPaid: BigNumber.from(payoutTimestamp), // updated
      highWaterMark: feeInfoPrePayout.lastSharePrice, // updated
      lastSharePrice: feeInfoPrePayout.lastSharePrice,
      aggregateValueDue: feeInfoPrePayout.aggregateValueDue,
    });

    // Assert event
    await assertEvent(payoutTx, 'PaidOut', {
      comptrollerProxy: mockComptrollerProxy.address,
      prevHighWaterMark: initialSharePrice,
      nextHighWaterMark: feeInfoPrePayout.lastSharePrice,
    });
  });
});

describe('payoutAllowed', () => {
  it('requires one full period to have passed since activation', async () => {
    const {
      mockComptrollerProxy,
      mockFeeManager,
      mockVaultProxy,
      performanceFeePeriod,
      standalonePerformanceFee: performanceFee,
    } = await provider.snapshot(snapshot);

    await activateWithInitialValues({
      mockFeeManager,
      mockComptrollerProxy,
      mockVaultProxy,
      performanceFee,
    });

    // payoutAllowed should be false
    const badPayoutAllowedCall1 = performanceFee.payoutAllowed(
      mockComptrollerProxy,
    );
    await expect(badPayoutAllowedCall1).resolves.toBe(false);

    // Warp to almost the end of the period
    const warpOffset = 10;
    await provider.send('evm_increaseTime', [
      performanceFeePeriod.sub(warpOffset).toNumber(),
    ]);
    await provider.send('evm_mine', []);

    // payoutAllowed should still be false
    const badPayoutAllowedCall2 = performanceFee.payoutAllowed(
      mockComptrollerProxy,
    );
    await expect(badPayoutAllowedCall2).resolves.toBe(false);

    // Warp to the end of the period
    await provider.send('evm_increaseTime', [warpOffset]);
    await provider.send('evm_mine', []);

    // payoutAllowed should be true
    const goodPayoutAllowedCall = performanceFee.payoutAllowed(
      mockComptrollerProxy,
    );
    await expect(goodPayoutAllowedCall).resolves.toBe(true);
  });

  it('requires a subsequent period to pass after a previous payout', async () => {
    const {
      mockComptrollerProxy,
      mockFeeManager,
      mockVaultProxy,
      performanceFeePeriod,
      standalonePerformanceFee: performanceFee,
    } = await provider.snapshot(snapshot);

    await activateWithInitialValues({
      mockFeeManager,
      mockComptrollerProxy,
      mockVaultProxy,
      performanceFee,
    });

    // Raise next high water mark by increasing price
    await assertAdjustedPerformance({
      mockFeeManager,
      mockComptrollerProxy,
      mockVaultProxy,
      nextGav: utils.parseEther('1.1'),
      performanceFee,
    });

    // Warp to the end of the period + an offset
    const offset = 1000;
    await provider.send('evm_increaseTime', [
      performanceFeePeriod.add(offset).toNumber(),
    ]);
    await provider.send('evm_mine', []);

    // Payout once to reset the fee period
    const initialPayoutCall = performanceFee.payout
      .args(mockComptrollerProxy, mockVaultProxy)
      .from(mockFeeManager.address)
      .call();
    await expect(initialPayoutCall).resolves.toBe(true);
    await mockFeeManager.forward(
      performanceFee.payout,
      mockComptrollerProxy,
      mockVaultProxy,
    );

    // Warp to the end of the 2nd period (performanceFeePeriod - offset1) - another offset2
    const offset2 = 100;
    await provider.send('evm_increaseTime', [
      performanceFeePeriod.sub(offset).sub(offset2).toNumber(),
    ]);
    await provider.send('evm_mine', []);

    // payoutAllowed should return false since we haven't completed the 2nd period
    const badPayoutAllowedCall = performanceFee.payoutAllowed(
      mockComptrollerProxy,
    );
    await expect(badPayoutAllowedCall).resolves.toBe(false);

    // Warp to the end of the period
    await provider.send('evm_increaseTime', [offset2]);
    await provider.send('evm_mine', []);

    // payoutAllowed should now return true
    const goodPayoutAllowedCall = performanceFee.payoutAllowed(
      mockComptrollerProxy,
    );
    await expect(goodPayoutAllowedCall).resolves.toBe(true);
  });
});

describe('settle', () => {
  it('can only be called by the FeeManager', async () => {
    const {
      mockComptrollerProxy,
      mockVaultProxy,
      standalonePerformanceFee,
    } = await provider.snapshot(snapshot);

    const settleTx = standalonePerformanceFee.settle(
      mockComptrollerProxy,
      mockVaultProxy,
      feeHooks.Continuous,
      '0x',
    );

    await expect(settleTx).rejects.toBeRevertedWith(
      'Only the FeeManger can make this call',
    );
  });

  it('correctly handles valid call (no change in share price)', async () => {
    const {
      mockComptrollerProxy,
      mockFeeManager,
      mockVaultProxy,
      standalonePerformanceFee: performanceFee,
    } = await provider.snapshot(snapshot);

    await activateWithInitialValues({
      mockFeeManager,
      mockComptrollerProxy,
      mockVaultProxy,
      performanceFee,
    });

    const feeHook = feeHooks.Continuous;
    const settlementData = constants.HashZero;

    // settle.call() to assert return values and get the sharesOutstanding
    const settleCall = performanceFee.settle
      .args(mockComptrollerProxy, mockVaultProxy, feeHook, settlementData)
      .from(mockFeeManager.address)
      .call();
    await expect(settleCall).resolves.toMatchObject({
      0: feeSettlementTypes.None,
      1: constants.AddressZero,
      2: BigNumber.from(0),
    });

    // Execute settle() tx
    const settleTx = mockFeeManager.forward(
      performanceFee.settle,
      mockComptrollerProxy,
      mockVaultProxy,
      feeHook,
      settlementData,
    );
    await expect(settleTx).resolves.toBeReceipt();

    // Assert that no events were emitted
    await assertNoEvent(settleTx, 'PerformanceUpdated');
  });

  it('correctly handles valid call (positive value change with no shares outstanding)', async () => {
    const {
      mockComptrollerProxy,
      mockFeeManager,
      mockVaultProxy,
      standalonePerformanceFee: performanceFee,
    } = await provider.snapshot(snapshot);

    await activateWithInitialValues({
      mockFeeManager,
      mockComptrollerProxy,
      mockVaultProxy,
      performanceFee,
    });

    // Increase performance
    const { feeSettlementType } = await assertAdjustedPerformance({
      mockFeeManager,
      mockComptrollerProxy,
      mockVaultProxy,
      nextGav: utils.parseEther('2'),
      performanceFee,
    });
    expect(feeSettlementType).toBe(feeSettlementTypes.MintSharesOutstanding);
  });

  it('correctly handles valid call (positive value change with shares outstanding)', async () => {
    const {
      mockComptrollerProxy,
      mockFeeManager,
      mockVaultProxy,
      standalonePerformanceFee: performanceFee,
    } = await provider.snapshot(snapshot);

    await activateWithInitialValues({
      mockFeeManager,
      mockComptrollerProxy,
      mockVaultProxy,
      performanceFee,
    });

    // Increase performance
    await assertAdjustedPerformance({
      mockFeeManager,
      mockComptrollerProxy,
      mockVaultProxy,
      nextGav: utils.parseEther('2'),
      performanceFee,
    });

    // Increase performance further
    const { feeSettlementType } = await assertAdjustedPerformance({
      mockFeeManager,
      mockComptrollerProxy,
      mockVaultProxy,
      nextGav: utils.parseEther('3'),
      performanceFee,
    });
    expect(feeSettlementType).toBe(feeSettlementTypes.MintSharesOutstanding);
  });

  it('correctly handles valid call (negative value change less than shares outstanding)', async () => {
    const {
      mockComptrollerProxy,
      mockFeeManager,
      mockVaultProxy,
      standalonePerformanceFee: performanceFee,
    } = await provider.snapshot(snapshot);

    await activateWithInitialValues({
      mockFeeManager,
      mockComptrollerProxy,
      mockVaultProxy,
      performanceFee,
    });

    // Increase performance
    await assertAdjustedPerformance({
      mockFeeManager,
      mockComptrollerProxy,
      mockVaultProxy,
      nextGav: utils.parseEther('2'),
      performanceFee,
    });

    // Decrease performance, still above HWM
    const { feeSettlementType } = await assertAdjustedPerformance({
      mockFeeManager,
      mockComptrollerProxy,
      mockVaultProxy,
      nextGav: utils.parseEther('1.5'),
      performanceFee,
    });
    expect(feeSettlementType).toBe(feeSettlementTypes.BurnSharesOutstanding);
  });

  it('correctly handles valid call (negative value change greater than shares outstanding)', async () => {
    const {
      mockComptrollerProxy,
      mockFeeManager,
      mockVaultProxy,
      standalonePerformanceFee: performanceFee,
    } = await provider.snapshot(snapshot);

    await activateWithInitialValues({
      mockFeeManager,
      mockComptrollerProxy,
      mockVaultProxy,
      performanceFee,
    });

    // Increase performance
    await assertAdjustedPerformance({
      mockFeeManager,
      mockComptrollerProxy,
      mockVaultProxy,
      nextGav: utils.parseEther('2'),
      performanceFee,
    });

    // Decrease performance, below HWM
    const { feeSettlementType } = await assertAdjustedPerformance({
      mockFeeManager,
      mockComptrollerProxy,
      mockVaultProxy,
      nextGav: utils.parseEther('0.5'),
      performanceFee,
    });
    expect(feeSettlementType).toBe(feeSettlementTypes.BurnSharesOutstanding);

    // Outstanding shares should be back to 0
    await expect(
      mockFeeManager.getFeeSharesOutstandingForFund(
        mockComptrollerProxy,
        performanceFee,
      ),
    ).resolves.toEqBigNumber(0);
  });

  it.todo('correctly handles valid call (PreBuySharesHook)');

  it.todo('correctly handles valid call (PreRedeemSharesHook)');

  it.todo(
    'correctly handles slight change in accrued value with no shares due',
  );
});
