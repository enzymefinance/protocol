import type { AddressLike, MockContract } from '@enzymefinance/ethers';
import { extractEvent, randomAddress } from '@enzymefinance/ethers';
import {
  ComptrollerLib,
  FeeHook,
  FeeManager,
  feeManagerConfigArgs,
  FeeSettlementType,
  PerformanceFee,
  performanceFeeConfigArgs,
  performanceFeeSharesDue,
  StandardToken,
  VaultLib,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import {
  assertEvent,
  assertNoEvent,
  buyShares,
  createNewFund,
  deployProtocolFixture,
  redeemSharesInKind,
  transactionTimestamp,
} from '@enzymefinance/testutils';
import type { BigNumberish, BytesLike } from 'ethers';
import { BigNumber, constants, utils } from 'ethers';

const FIVE_PERCENT = BigNumber.from(500);
const TEN_PERCENT = BigNumber.from(1000);
const ONE_HUNDRED_PERCENT = BigNumber.from(10000);
const SHARES_UNIT = utils.parseEther('1');

async function createMocksForPerformanceFeeConfig(fork: ProtocolDeployment) {
  const deployer = fork.deployer;
  // Mock a FeeManager
  const mockFeeManager = await FeeManager.mock(deployer);
  await mockFeeManager.getFeeSharesOutstandingForFund.returns(0);

  // Mock a denomination asset
  const mockDenominationAssetDecimals = 8;
  const mockDenominationAsset = await StandardToken.mock(deployer);
  await mockDenominationAsset.decimals.returns(mockDenominationAssetDecimals);

  // Mock a VaultProxy
  const mockVaultProxy = await VaultLib.mock(deployer);
  await mockVaultProxy.totalSupply.returns(0);
  await mockVaultProxy.balanceOf.returns(0);

  // Mock a ComptrollerProxy
  const mockComptrollerProxy = await ComptrollerLib.mock(deployer);
  await mockComptrollerProxy.calcGav.returns(0);
  await mockComptrollerProxy.calcGrossShareValue.returns(utils.parseUnits('1', mockDenominationAssetDecimals));
  await mockComptrollerProxy.getDenominationAsset.returns(mockDenominationAsset);
  await mockComptrollerProxy.getVaultProxy.returns(mockVaultProxy);

  return { mockComptrollerProxy, mockDenominationAsset, mockFeeManager, mockVaultProxy };
}

async function deployAndConfigureStandalonePerformanceFee(
  fork: ProtocolDeployment,
  {
    mockComptrollerProxy = '0x',
    mockFeeManager,
    performanceFeeRate = 0,
    performanceFeePeriod = 0,
  }: {
    mockComptrollerProxy?: AddressLike;
    mockFeeManager: MockContract<FeeManager>;
    performanceFeeRate?: BigNumberish;
    performanceFeePeriod?: BigNumberish;
  },
) {
  const performanceFee = await PerformanceFee.deploy(fork.deployer, mockFeeManager);

  if (mockComptrollerProxy != '0x') {
    // Add fee settings for ComptrollerProxy
    const performanceFeeConfig = performanceFeeConfigArgs({
      period: performanceFeePeriod,
      rate: performanceFeeRate,
    });

    await mockFeeManager.forward(performanceFee.addFundSettings, mockComptrollerProxy, performanceFeeConfig);
  }

  return performanceFee;
}

async function activateWithInitialValues({
  mockFeeManager,
  mockComptrollerProxy,
  mockVaultProxy,
  performanceFee,
  gav,
  totalSharesSupply = utils.parseEther('1'),
}: {
  mockFeeManager: MockContract<FeeManager>;
  mockComptrollerProxy: MockContract<ComptrollerLib>;
  mockVaultProxy: MockContract<VaultLib>;
  performanceFee: PerformanceFee;
  gav: BigNumberish;
  totalSharesSupply?: BigNumberish;
}) {
  await mockComptrollerProxy.calcGav.returns(gav);
  await mockVaultProxy.totalSupply.returns(totalSharesSupply);
  await mockComptrollerProxy.calcGrossShareValue.returns(
    BigNumber.from(gav).mul(utils.parseEther('1')).div(totalSharesSupply),
  );

  return mockFeeManager.forward(performanceFee.activateForFund, mockComptrollerProxy, mockVaultProxy);
}

async function assertAdjustedPerformance({
  mockFeeManager,
  mockComptrollerProxy,
  mockVaultProxy,
  performanceFee,
  nextGav,
  feeHook = FeeHook.Continuous,
  settlementData = constants.HashZero,
}: {
  mockFeeManager: MockContract<FeeManager>;
  mockComptrollerProxy: MockContract<ComptrollerLib>;
  mockVaultProxy: MockContract<VaultLib>;
  performanceFee: PerformanceFee;
  nextGav: BigNumberish;
  feeHook?: FeeHook;
  settlementData?: BytesLike;
}) {
  // Change the share price by altering the gav
  const prevTotalSharesSupply = await mockVaultProxy.totalSupply();
  await mockComptrollerProxy.calcGav.returns(nextGav);
  await mockComptrollerProxy.calcGrossShareValue.returns(
    BigNumber.from(nextGav).mul(utils.parseEther('1')).div(prevTotalSharesSupply),
  );

  // Calculate expected performance results for next settlement
  const feeInfo = await performanceFee.getFeeInfoForFund(mockComptrollerProxy);
  const prevTotalSharesOutstanding = await mockVaultProxy.balanceOf(mockVaultProxy);
  const prevPerformanceFeeSharesOutstanding = await mockFeeManager.getFeeSharesOutstandingForFund(
    mockComptrollerProxy,
    performanceFee,
  );

  const { nextAggregateValueDue, nextSharePrice, sharesDue } = performanceFeeSharesDue({
    gav: nextGav,
    highWaterMark: feeInfo.highWaterMark,
    performanceFeeSharesOutstanding: prevPerformanceFeeSharesOutstanding,
    prevAggregateValueDue: feeInfo.aggregateValueDue,
    prevSharePrice: feeInfo.lastSharePrice,
    rate: feeInfo.rate,
    totalSharesOutstanding: prevTotalSharesOutstanding,
    totalSharesSupply: prevTotalSharesSupply,
  });

  // Determine fee settlement type
  let feeSettlementType = FeeSettlementType.None;
  if (sharesDue.gt(0)) {
    feeSettlementType = FeeSettlementType.MintSharesOutstanding;
  } else if (sharesDue.lt(0)) {
    feeSettlementType = FeeSettlementType.BurnSharesOutstanding;
  }

  // settle.call() to assert return values and get the sharesOutstanding
  const settleCall = await performanceFee.settle
    .args(mockComptrollerProxy, mockVaultProxy, feeHook, settlementData, nextGav)
    .from(mockFeeManager)
    .call();

  expect(settleCall).toMatchFunctionOutput(performanceFee.settle, {
    settlementType_: feeSettlementType,
    sharesDue_: sharesDue.abs(),
  });

  // Execute settle() tx
  const settleReceipt = await mockFeeManager.forward(
    performanceFee.settle,
    mockComptrollerProxy,
    mockVaultProxy,
    feeHook,
    settlementData,
    nextGav,
  );

  // Assert PerformanceUpdated event
  assertEvent(settleReceipt, 'PerformanceUpdated', {
    comptrollerProxy: mockComptrollerProxy,
    nextAggregateValueDue,
    prevAggregateValueDue: feeInfo.aggregateValueDue,
    sharesOutstandingDiff: sharesDue,
  });

  // Execute update() tx
  const updateReceipt = await mockFeeManager.forward(
    performanceFee.update,
    mockComptrollerProxy,
    mockVaultProxy,
    feeHook,
    settlementData,
    nextGav,
  );

  // Assert event
  assertEvent(updateReceipt, 'LastSharePriceUpdated', {
    comptrollerProxy: mockComptrollerProxy,
    nextSharePrice,
    prevSharePrice: feeInfo.lastSharePrice,
  });

  // Set sharesOutstanding and new shares total supply
  await mockVaultProxy.balanceOf.given(mockVaultProxy).returns(prevTotalSharesOutstanding.add(sharesDue));
  await mockFeeManager.getFeeSharesOutstandingForFund
    .given(mockComptrollerProxy, performanceFee)
    .returns(prevPerformanceFeeSharesOutstanding.add(sharesDue));
  await mockVaultProxy.totalSupply.returns(prevTotalSharesSupply.add(sharesDue));

  return { feeSettlementType, settleReceipt };
}

it('has correct config', async () => {
  const performanceFee = fork.deployment.performanceFee;

  for (const hook of Object.values(FeeHook)) {
    const settlesOnHook = [FeeHook.Continuous, FeeHook.PreBuyShares, FeeHook.PreRedeemShares].includes(hook);
    expect(await performanceFee.settlesOnHook(hook)).toMatchFunctionOutput(performanceFee.settlesOnHook, {
      settles_: settlesOnHook,
      usesGav_: settlesOnHook,
    });
    const updatesOnHook = [FeeHook.Continuous, FeeHook.PostBuyShares, FeeHook.PreRedeemShares].includes(hook);
    expect(await performanceFee.updatesOnHook(hook)).toMatchFunctionOutput(performanceFee.updatesOnHook, {
      updates_: updatesOnHook,
      usesGav_: updatesOnHook,
    });
  }
});

describe('addFundSettings', () => {
  let fork: ProtocolDeployment;
  let performanceFee: PerformanceFee;
  let performanceFeeRate: BigNumberish;
  let performanceFeePeriod: BigNumberish;
  let mockComptrollerProxy: MockContract<ComptrollerLib>;
  let mockFeeManager: MockContract<FeeManager>;

  beforeAll(async () => {
    fork = await deployProtocolFixture();
    const mocks = await createMocksForPerformanceFeeConfig(fork);
    mockComptrollerProxy = mocks.mockComptrollerProxy;
    mockFeeManager = mocks.mockFeeManager;

    performanceFeeRate = TEN_PERCENT;
    performanceFeePeriod = BigNumber.from(60 * 60 * 24 * 365); // 365 days
    performanceFee = await deployAndConfigureStandalonePerformanceFee(fork, { mockFeeManager });
  });

  it('can only be called by the FeeManager', async () => {
    const [randomUser] = fork.accounts;

    const performanceFeeConfig = performanceFeeConfigArgs({
      period: performanceFeePeriod,
      rate: performanceFeeRate,
    });

    await expect(
      performanceFee.connect(randomUser).addFundSettings(mockComptrollerProxy, performanceFeeConfig),
    ).rejects.toBeRevertedWith('Only the FeeManger can make this call');
  });

  it('correctly handles valid call', async () => {
    const feeRecipient = randomAddress();

    const performanceFeeConfig = performanceFeeConfigArgs({
      period: performanceFeePeriod,
      rate: performanceFeeRate,
      recipient: feeRecipient,
    });

    const receipt = await mockFeeManager.forward(
      performanceFee.addFundSettings,
      mockComptrollerProxy,
      performanceFeeConfig,
    );

    // Assert correct events were emitted
    assertEvent(receipt, 'FundSettingsAdded', {
      comptrollerProxy: mockComptrollerProxy,
      period: performanceFeePeriod,
      rate: performanceFeeRate,
    });

    // Assert state
    expect(await performanceFee.getFeeInfoForFund(mockComptrollerProxy)).toMatchFunctionOutput(
      performanceFee.getFeeInfoForFund,
      {
        activated: BigNumber.from(0),
        aggregateValueDue: BigNumber.from(0),
        highWaterMark: BigNumber.from(0),
        lastPaid: BigNumber.from(0),
        lastSharePrice: BigNumber.from(0),
        period: performanceFeePeriod,
        rate: performanceFeeRate,
      },
    );

    expect(await performanceFee.getRecipientForFund(mockComptrollerProxy)).toMatchAddress(feeRecipient);
  });
});

describe('activateForFund', () => {
  let fork: ProtocolDeployment;
  let performanceFee: PerformanceFee;
  let performanceFeeRate: BigNumberish;
  let performanceFeePeriod: BigNumberish;
  let mockComptrollerProxy: MockContract<ComptrollerLib>;
  let mockVaultProxy: MockContract<VaultLib>;
  let mockFeeManager: MockContract<FeeManager>;
  let mockDenominationAsset: MockContract<StandardToken>;

  beforeAll(async () => {
    fork = await deployProtocolFixture();
    const mocks = await createMocksForPerformanceFeeConfig(fork);
    mockComptrollerProxy = mocks.mockComptrollerProxy;
    mockFeeManager = mocks.mockFeeManager;
    mockVaultProxy = mocks.mockVaultProxy;
    mockDenominationAsset = mocks.mockDenominationAsset;

    performanceFeeRate = TEN_PERCENT;
    performanceFeePeriod = BigNumber.from(60 * 60 * 24 * 365); // 365 days
    performanceFee = await deployAndConfigureStandalonePerformanceFee(fork, {
      mockComptrollerProxy,
      mockFeeManager,
      performanceFeePeriod,
      performanceFeeRate,
    });
  });

  it('can only be called by the FeeManager', async () => {
    const [randomUser] = fork.accounts;

    await expect(
      performanceFee.connect(randomUser).activateForFund(mockComptrollerProxy, mockVaultProxy),
    ).rejects.toBeRevertedWith('Only the FeeManger can make this call');
  });

  it('correctly handles valid call', async () => {
    // Set grossShareValue to an arbitrary value
    const grossShareValue = utils.parseUnits('5', await mockDenominationAsset.decimals());
    await mockComptrollerProxy.calcGrossShareValue.returns(grossShareValue);

    // Activate fund
    const receipt = await mockFeeManager.forward(performanceFee.activateForFund, mockComptrollerProxy, mockVaultProxy);

    // Assert event
    assertEvent(receipt, 'ActivatedForFund', {
      comptrollerProxy: mockComptrollerProxy,
      highWaterMark: grossShareValue,
    });

    // Assert state
    const getFeeInfoForFundCall = await performanceFee.getFeeInfoForFund(mockComptrollerProxy);
    const activationTimestamp = await transactionTimestamp(receipt);
    expect(getFeeInfoForFundCall).toMatchFunctionOutput(performanceFee.getFeeInfoForFund, {
      activated: BigNumber.from(activationTimestamp),
      aggregateValueDue: BigNumber.from(0),
      highWaterMark: grossShareValue,
      lastPaid: BigNumber.from(0),
      lastSharePrice: grossShareValue,
      period: performanceFeePeriod,
      rate: performanceFeeRate,
    });
  });
});

describe('payout', () => {
  let fork: ProtocolDeployment;
  let performanceFee: PerformanceFee;
  let performanceFeePeriod: BigNumber;
  let mockComptrollerProxy: MockContract<ComptrollerLib>;
  let mockVaultProxy: MockContract<VaultLib>;
  let mockFeeManager: MockContract<FeeManager>;
  let mockDenominationAsset: MockContract<StandardToken>;

  beforeEach(async () => {
    fork = await deployProtocolFixture();
    const mocks = await createMocksForPerformanceFeeConfig(fork);
    mockComptrollerProxy = mocks.mockComptrollerProxy;
    mockFeeManager = mocks.mockFeeManager;
    mockVaultProxy = mocks.mockVaultProxy;
    mockDenominationAsset = mocks.mockDenominationAsset;

    const performanceFeeRate = TEN_PERCENT;
    performanceFeePeriod = BigNumber.from(60 * 60 * 24 * 365); // 365 days
    performanceFee = await deployAndConfigureStandalonePerformanceFee(fork, {
      mockComptrollerProxy,
      mockFeeManager,
      performanceFeePeriod,
      performanceFeeRate,
    });
  });

  it('can only be called by the FeeManager', async () => {
    const [randomUser] = fork.accounts;

    await expect(
      performanceFee.connect(randomUser).payout(mockComptrollerProxy, mockVaultProxy),
    ).rejects.toBeRevertedWith('Only the FeeManger can make this call');
  });

  it('correctly handles a valid call (HWM has not increased)', async () => {
    await activateWithInitialValues({
      gav: utils.parseUnits('1', await mockDenominationAsset.decimals()),
      mockComptrollerProxy,
      mockFeeManager,
      mockVaultProxy,
      performanceFee,
    });

    const feeInfoPrePayout = await performanceFee.getFeeInfoForFund(mockComptrollerProxy);

    // Warp to the end of the period
    await provider.send('evm_increaseTime', [performanceFeePeriod.toNumber()]);
    await provider.send('evm_mine', []);

    // call() function to assert return value
    const payoutCall = await performanceFee.payout
      .args(mockComptrollerProxy, mockVaultProxy)
      .from(mockFeeManager)
      .call();

    expect(payoutCall).toBe(true);

    // send() function
    const receipt = await mockFeeManager.forward(performanceFee.payout, mockComptrollerProxy, mockVaultProxy);

    // Assert event
    assertEvent(receipt, 'PaidOut', {
      aggregateValueDue: feeInfoPrePayout.aggregateValueDue,
      comptrollerProxy: mockComptrollerProxy,
      nextHighWaterMark: feeInfoPrePayout.highWaterMark,
      prevHighWaterMark: feeInfoPrePayout.highWaterMark,
    });

    // Assert state
    const getFeeInfoForFundCall = await performanceFee.getFeeInfoForFund(mockComptrollerProxy);

    const payoutTimestamp = await transactionTimestamp(receipt);
    expect(getFeeInfoForFundCall).toMatchFunctionOutput(performanceFee.getFeeInfoForFund, {
      activated: feeInfoPrePayout.activated,

      aggregateValueDue: 0,

      // updated
      highWaterMark: feeInfoPrePayout.highWaterMark,

      lastPaid: BigNumber.from(payoutTimestamp),
      lastSharePrice: feeInfoPrePayout.lastSharePrice,
      period: feeInfoPrePayout.period,
      rate: feeInfoPrePayout.rate, // updated
    });
  });

  it('correctly handles a valid call (HWM has increased)', async () => {
    await activateWithInitialValues({
      gav: utils.parseUnits('1', await mockDenominationAsset.decimals()),
      mockComptrollerProxy,
      mockFeeManager,
      mockVaultProxy,
      performanceFee,
    });

    const initialSharePrice = await mockComptrollerProxy.calcGrossShareValue.call();

    // Raise next high water mark by increasing price
    await assertAdjustedPerformance({
      mockComptrollerProxy,
      mockFeeManager,
      mockVaultProxy,
      nextGav: utils.parseUnits('1.1', await mockDenominationAsset.decimals()),
      performanceFee,
    });

    const feeInfoPrePayout = await performanceFee.getFeeInfoForFund(mockComptrollerProxy);

    // Warp to the end of the period
    await provider.send('evm_increaseTime', [performanceFeePeriod.toNumber()]);
    await provider.send('evm_mine', []);

    // call() function to assert return value
    const payoutCall = await performanceFee.payout
      .args(mockComptrollerProxy, mockVaultProxy)
      .from(mockFeeManager)
      .call();

    expect(payoutCall).toBe(true);

    // send() function
    const receipt = await mockFeeManager.forward(performanceFee.payout, mockComptrollerProxy, mockVaultProxy);

    // Assert event
    assertEvent(receipt, 'PaidOut', {
      aggregateValueDue: feeInfoPrePayout.aggregateValueDue,
      comptrollerProxy: mockComptrollerProxy,
      nextHighWaterMark: feeInfoPrePayout.lastSharePrice,
      prevHighWaterMark: initialSharePrice,
    });

    // Assert state
    const getFeeInfoForFundCall = await performanceFee.getFeeInfoForFund(mockComptrollerProxy);
    const payoutTimestamp = await transactionTimestamp(receipt);
    expect(getFeeInfoForFundCall).toMatchFunctionOutput(performanceFee.getFeeInfoForFund, {
      activated: feeInfoPrePayout.activated,

      aggregateValueDue: 0,

      // updated
      highWaterMark: feeInfoPrePayout.lastSharePrice,

      lastPaid: BigNumber.from(payoutTimestamp),
      // updated
      lastSharePrice: feeInfoPrePayout.lastSharePrice,

      period: feeInfoPrePayout.period,

      rate: feeInfoPrePayout.rate, // updated
    });
  });
});

describe('payoutAllowed', () => {
  let fork: ProtocolDeployment;
  let performanceFee: PerformanceFee;
  let performanceFeePeriod: BigNumber;
  let mockComptrollerProxy: MockContract<ComptrollerLib>;
  let mockVaultProxy: MockContract<VaultLib>;
  let mockFeeManager: MockContract<FeeManager>;
  let mockDenominationAsset: MockContract<StandardToken>;

  beforeEach(async () => {
    fork = await deployProtocolFixture();
    const mocks = await createMocksForPerformanceFeeConfig(fork);
    mockComptrollerProxy = mocks.mockComptrollerProxy;
    mockVaultProxy = mocks.mockVaultProxy;
    mockFeeManager = mocks.mockFeeManager;
    mockDenominationAsset = mocks.mockDenominationAsset;

    const performanceFeeRate = TEN_PERCENT;
    performanceFeePeriod = BigNumber.from(60 * 60 * 24 * 365); // 365 days
    performanceFee = await deployAndConfigureStandalonePerformanceFee(fork, {
      mockComptrollerProxy,
      mockFeeManager,
      performanceFeePeriod,
      performanceFeeRate,
    });
  });

  it('requires one full period to have passed since activation', async () => {
    await activateWithInitialValues({
      gav: utils.parseUnits('1', await mockDenominationAsset.decimals()),
      mockComptrollerProxy,
      mockFeeManager,
      mockVaultProxy,
      performanceFee,
    });

    // payoutAllowed should be false
    await expect(performanceFee.payoutAllowed(mockComptrollerProxy)).resolves.toBe(false);

    // Warp to almost the end of the period
    const warpOffset = 10;
    await provider.send('evm_increaseTime', [performanceFeePeriod.sub(warpOffset).toNumber()]);
    await provider.send('evm_mine', []);

    // payoutAllowed should still be false
    await expect(performanceFee.payoutAllowed(mockComptrollerProxy)).resolves.toBe(false);

    // Warp to the end of the period
    await provider.send('evm_increaseTime', [warpOffset]);
    await provider.send('evm_mine', []);

    // payoutAllowed should be true
    await expect(performanceFee.payoutAllowed(mockComptrollerProxy)).resolves.toBe(true);
  });

  it('requires a subsequent period to pass after a previous payout', async () => {
    await activateWithInitialValues({
      gav: utils.parseUnits('1', await mockDenominationAsset.decimals()),
      mockComptrollerProxy,
      mockFeeManager,
      mockVaultProxy,
      performanceFee,
    });

    // Raise next high water mark by increasing price
    await assertAdjustedPerformance({
      mockComptrollerProxy,
      mockFeeManager,
      mockVaultProxy,
      nextGav: utils.parseUnits('1.1', await mockDenominationAsset.decimals()),
      performanceFee,
    });

    // Warp to the end of the period + an offset
    const offset = 1000;
    await provider.send('evm_increaseTime', [performanceFeePeriod.add(offset).toNumber()]);
    await provider.send('evm_mine', []);

    // Payout once to reset the fee period
    const initialPayoutCall = await performanceFee.payout
      .args(mockComptrollerProxy, mockVaultProxy)
      .from(mockFeeManager)
      .call();

    expect(initialPayoutCall).toBe(true);

    await mockFeeManager.forward(performanceFee.payout, mockComptrollerProxy, mockVaultProxy);

    // Warp to the end of the 2nd period (performanceFeePeriod - offset1) - another offset2
    const offset2 = 100;
    const increaseTime = performanceFeePeriod.sub(offset).sub(offset2).toNumber();

    await provider.send('evm_increaseTime', [increaseTime]);
    await provider.send('evm_mine', []);

    // payoutAllowed should return false since we haven't completed the 2nd period
    const badPayoutAllowedCall = await performanceFee.payoutAllowed(mockComptrollerProxy);
    expect(badPayoutAllowedCall).toBe(false);

    // Warp to the end of the period
    await provider.send('evm_increaseTime', [offset2]);
    await provider.send('evm_mine', []);

    // payoutAllowed should now return true
    const goodPayoutAllowedCall = await performanceFee.payoutAllowed(mockComptrollerProxy);
    expect(goodPayoutAllowedCall).toBe(true);
  });
});

describe('settle', () => {
  let fork: ProtocolDeployment;
  let performanceFee: PerformanceFee;
  let mockComptrollerProxy: MockContract<ComptrollerLib>;
  let mockVaultProxy: MockContract<VaultLib>;
  let mockFeeManager: MockContract<FeeManager>;
  let mockDenominationAsset: MockContract<StandardToken>;

  beforeEach(async () => {
    fork = await deployProtocolFixture();
    const mocks = await createMocksForPerformanceFeeConfig(fork);
    mockComptrollerProxy = mocks.mockComptrollerProxy;
    mockVaultProxy = mocks.mockVaultProxy;
    mockFeeManager = mocks.mockFeeManager;
    mockDenominationAsset = mocks.mockDenominationAsset;

    const performanceFeeRate = TEN_PERCENT;
    const performanceFeePeriod = BigNumber.from(60 * 60 * 24 * 365); // 365 days
    performanceFee = await deployAndConfigureStandalonePerformanceFee(fork, {
      mockComptrollerProxy,
      mockFeeManager,
      performanceFeePeriod,
      performanceFeeRate,
    });
  });

  it('can only be called by the FeeManager', async () => {
    const [randomUser] = fork.accounts;

    await expect(
      performanceFee.connect(randomUser).settle(mockComptrollerProxy, mockVaultProxy, FeeHook.Continuous, '0x', 0),
    ).rejects.toBeRevertedWith('Only the FeeManger can make this call');
  });

  it('correctly handles valid call (no change in share price)', async () => {
    await activateWithInitialValues({
      gav: utils.parseUnits('1', await mockDenominationAsset.decimals()),
      mockComptrollerProxy,
      mockFeeManager,
      mockVaultProxy,
      performanceFee,
    });

    const feeHook = FeeHook.Continuous;
    const settlementData = constants.HashZero;

    // settle.call() to assert return values and get the sharesOutstanding
    const gav = await mockComptrollerProxy.calcGav.args(true).call();
    const settleCall = await performanceFee.settle
      .args(mockComptrollerProxy, mockVaultProxy, feeHook, settlementData, gav)
      .from(mockFeeManager)
      .call();

    expect(settleCall).toMatchFunctionOutput(performanceFee.settle, {
      settlementType_: FeeSettlementType.None,
      sharesDue_: BigNumber.from(0),
    });

    // Execute settle() tx
    const settleReceipt = await mockFeeManager.forward(
      performanceFee.settle,
      mockComptrollerProxy,
      mockVaultProxy,
      feeHook,
      settlementData,
      gav,
    );

    // Assert that no events were emitted
    assertNoEvent(settleReceipt, 'PerformanceUpdated');
  });

  it('correctly handles valid call (positive value change with no shares outstanding)', async () => {
    await activateWithInitialValues({
      gav: utils.parseUnits('1', await mockDenominationAsset.decimals()),
      mockComptrollerProxy,
      mockFeeManager,
      mockVaultProxy,
      performanceFee,
    });

    // Increase performance
    const { feeSettlementType } = await assertAdjustedPerformance({
      mockComptrollerProxy,
      mockFeeManager,
      mockVaultProxy,
      nextGav: utils.parseUnits('2', await mockDenominationAsset.decimals()),
      performanceFee,
    });

    expect(feeSettlementType).toBe(FeeSettlementType.MintSharesOutstanding);
  });

  it('correctly handles valid call (positive value change with shares outstanding)', async () => {
    await activateWithInitialValues({
      gav: utils.parseUnits('1', await mockDenominationAsset.decimals()),
      mockComptrollerProxy,
      mockFeeManager,
      mockVaultProxy,
      performanceFee,
    });

    // Increase performance
    await assertAdjustedPerformance({
      mockComptrollerProxy,
      mockFeeManager,
      mockVaultProxy,
      nextGav: utils.parseUnits('2', await mockDenominationAsset.decimals()),
      performanceFee,
    });

    // Increase performance further
    const { feeSettlementType } = await assertAdjustedPerformance({
      mockComptrollerProxy,
      mockFeeManager,
      mockVaultProxy,
      nextGav: utils.parseUnits('3', await mockDenominationAsset.decimals()),
      performanceFee,
    });

    expect(feeSettlementType).toBe(FeeSettlementType.MintSharesOutstanding);
  });

  it('correctly handles valid call (negative value change less than shares outstanding)', async () => {
    await activateWithInitialValues({
      gav: utils.parseUnits('1', await mockDenominationAsset.decimals()),
      mockComptrollerProxy,
      mockFeeManager,
      mockVaultProxy,
      performanceFee,
    });

    // Increase performance
    await assertAdjustedPerformance({
      mockComptrollerProxy,
      mockFeeManager,
      mockVaultProxy,
      nextGav: utils.parseUnits('2', await mockDenominationAsset.decimals()),
      performanceFee,
    });

    // Decrease performance, still above HWM
    const { feeSettlementType } = await assertAdjustedPerformance({
      mockComptrollerProxy,
      mockFeeManager,
      mockVaultProxy,
      nextGav: utils.parseUnits('1.5', await mockDenominationAsset.decimals()),
      performanceFee,
    });

    expect(feeSettlementType).toBe(FeeSettlementType.BurnSharesOutstanding);
  });

  it('correctly handles valid call (negative value change greater than shares outstanding)', async () => {
    await activateWithInitialValues({
      gav: utils.parseUnits('1', await mockDenominationAsset.decimals()),
      mockComptrollerProxy,
      mockFeeManager,
      mockVaultProxy,
      performanceFee,
    });

    // Increase performance
    await assertAdjustedPerformance({
      mockComptrollerProxy,
      mockFeeManager,
      mockVaultProxy,
      nextGav: utils.parseUnits('2', await mockDenominationAsset.decimals()),
      performanceFee,
    });

    // Decrease performance, below HWM
    const { feeSettlementType } = await assertAdjustedPerformance({
      mockComptrollerProxy,
      mockFeeManager,
      mockVaultProxy,
      nextGav: utils.parseUnits('0.5', await mockDenominationAsset.decimals()),
      performanceFee,
    });

    expect(feeSettlementType).toBe(FeeSettlementType.BurnSharesOutstanding);

    // Outstanding shares should be back to 0
    await expect(mockVaultProxy.balanceOf(mockVaultProxy)).resolves.toEqBigNumber(0);
  });
});

describe('integration', () => {
  it('works correctly upon shares redemption for a non 18-decimal asset', async () => {
    const [fundOwner, investor] = fork.accounts;
    const performanceFee = fork.deployment.performanceFee;

    const denominationAsset = new StandardToken(fork.config.primitives.usdc, whales.usdc);
    const denominationAssetUnit = utils.parseUnits('1', await denominationAsset.decimals());

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset,
      feeManagerConfig: feeManagerConfigArgs({
        fees: [performanceFee],
        settings: [
          performanceFeeConfigArgs({
            period: BigNumber.from(60 * 60 * 24 * 365),
            rate: FIVE_PERCENT, // 365 days
          }),
        ],
      }),
      fundDeployer: fork.deployment.fundDeployer,
      fundName: 'TestFund',
      fundOwner,
      signer: fundOwner,
    });

    const initialInvestmentAmount = utils.parseUnits('2', await denominationAsset.decimals());
    await denominationAsset.transfer(investor, initialInvestmentAmount);
    await buyShares({
      buyer: investor,
      comptrollerProxy,
      denominationAsset,
      investmentAmount: initialInvestmentAmount,
    });

    // Performance fee state should be in expected initial configuration
    const initialFeeInfo = await performanceFee.getFeeInfoForFund(comptrollerProxy);
    expect(initialFeeInfo.lastSharePrice).toEqBigNumber(denominationAssetUnit);
    expect(initialFeeInfo.aggregateValueDue).toEqBigNumber(0);

    // Redeem small amount of shares
    const redeemTx1 = await redeemSharesInKind({
      comptrollerProxy,
      quantity: initialInvestmentAmount.div(4),
      signer: investor,
    });

    // The fees should not have emitted a failure event
    const failureEvents1 = extractEvent(redeemTx1 as any, 'PreRedeemSharesHookFailed');
    expect(failureEvents1.length).toBe(0);

    // Performance fee state should be exactly the same
    const feeInfo2 = await performanceFee.getFeeInfoForFund(comptrollerProxy);
    expect(feeInfo2.lastSharePrice).toEqBigNumber(initialFeeInfo.lastSharePrice);
    expect(feeInfo2.aggregateValueDue).toEqBigNumber(initialFeeInfo.aggregateValueDue);

    // Bump performance by sending denomination asset to the vault
    const gavIncreaseAmount = utils.parseUnits('0.5', await denominationAsset.decimals());
    await denominationAsset.transfer(vaultProxy, gavIncreaseAmount);

    // Redeem more of remaining shares
    const redeemAmount2 = (await vaultProxy.balanceOf(investor)).div(4);
    const redeemTx2 = await redeemSharesInKind({
      comptrollerProxy,
      quantity: redeemAmount2,
      signer: investor,
    });

    // The fees should not have emitted a failure event
    const failureEvents2 = extractEvent(redeemTx2 as any, 'PreRedeemSharesHookFailed');
    expect(failureEvents2.length).toBe(0);

    // Performance fee state should have updated correctly
    const gavPostRedeem2 = await comptrollerProxy.calcGav.args(true).call();
    const sharesSupplyNetSharesOutstanding = (await vaultProxy.totalSupply()).sub(
      await vaultProxy.balanceOf(vaultProxy),
    );
    const feeInfo3 = await performanceFee.getFeeInfoForFund(comptrollerProxy);
    expect(feeInfo3.lastSharePrice).toEqBigNumber(
      gavPostRedeem2.mul(SHARES_UNIT).div(sharesSupplyNetSharesOutstanding),
    );
    // This is 1 wei less than expected
    expect(feeInfo3.aggregateValueDue).toEqBigNumber(
      BigNumber.from(feeInfo3.rate).mul(gavIncreaseAmount).div(ONE_HUNDRED_PERCENT).sub(1),
    );
  });
});
