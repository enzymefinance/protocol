import { AddressLike, extractEvent, MockContract } from '@enzymefinance/ethers';
import {
  ComptrollerLib,
  convertRateToScaledPerSecondRate,
  convertScaledPerSecondRateToRate,
  FeeHook,
  FeeSettlementType,
  ManagementFee,
  managementFeeConfigArgs,
  managementFeeSharesDue,
  VaultLib,
} from '@enzymefinance/protocol';
import { assertEvent, deployProtocolFixture, ProtocolDeployment, transactionTimestamp } from '@enzymefinance/testutils';
import { BigNumber, BigNumberish, utils } from 'ethers';

async function createMocksForManagementConfig(fork: ProtocolDeployment) {
  // Mock a VaultProxy
  const mockVaultProxy = await VaultLib.mock(fork.deployer);
  await mockVaultProxy.totalSupply.returns(0);
  await mockVaultProxy.balanceOf.returns(0);

  // Mock a ComptrollerProxy
  const mockComptrollerProxy = await ComptrollerLib.mock(fork.deployer);
  await mockComptrollerProxy.getVaultProxy.returns(mockVaultProxy);

  return { mockComptrollerProxy, mockVaultProxy };
}

async function deployAndConfigureStandaloneManagementFee(
  fork: ProtocolDeployment,
  {
    comptrollerProxy = '0x',
    scaledPerSecondRate = 0,
  }: {
    comptrollerProxy?: AddressLike;
    scaledPerSecondRate?: BigNumberish;
  },
) {
  const [EOAFeeManager] = fork.accounts.slice(-1);

  // Create standalone ManagementFee
  let managementFee = await ManagementFee.deploy(fork.deployer, EOAFeeManager);
  managementFee = managementFee.connect(EOAFeeManager);

  if (comptrollerProxy != '0x') {
    // Add fee settings for ComptrollerProxy
    const managementFeeConfig = managementFeeConfigArgs(scaledPerSecondRate);
    await managementFee.addFundSettings(comptrollerProxy, managementFeeConfig);
  }

  return managementFee;
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const getFeeManagerCall = await fork.deployment.managementFee.getFeeManager();
    expect(getFeeManagerCall).toMatchAddress(fork.deployment.feeManager);

    // Implements expected hooks
    const implementedHooksCall = await fork.deployment.managementFee.implementedHooks();
    expect(implementedHooksCall).toMatchFunctionOutput(fork.deployment.managementFee.implementedHooks.fragment, {
      implementedHooksForSettle_: [FeeHook.Continuous, FeeHook.PreBuyShares, FeeHook.PreRedeemShares],
      implementedHooksForUpdate_: [],
      usesGavOnSettle_: false,
      usesGavOnUpdate_: false,
    });
  });
});

describe('addFundSettings', () => {
  let fork: ProtocolDeployment;
  let managementFee: ManagementFee;
  let mockComptrollerProxy: MockContract<ComptrollerLib>;
  let scaledPerSecondRate: BigNumberish;

  beforeAll(async () => {
    fork = await deployProtocolFixture();

    const mocks = await createMocksForManagementConfig(fork);
    mockComptrollerProxy = mocks.mockComptrollerProxy;

    const managementFeeRate = utils.parseEther('0.1'); // 10%
    scaledPerSecondRate = convertRateToScaledPerSecondRate(managementFeeRate);
    managementFee = await deployAndConfigureStandaloneManagementFee(fork, {});
  });

  it('can only be called by the FeeManager', async () => {
    const [randomUser] = fork.accounts;
    const managementFeeConfig = managementFeeConfigArgs(scaledPerSecondRate);

    await expect(
      managementFee.connect(randomUser).addFundSettings(mockComptrollerProxy, managementFeeConfig),
    ).rejects.toBeRevertedWith('Only the FeeManger can make this call');
  });

  it('sets initial config values for fund and fires events', async () => {
    const managementFeeConfig = managementFeeConfigArgs(scaledPerSecondRate);
    const receipt = await managementFee.addFundSettings(mockComptrollerProxy, managementFeeConfig);

    // Assert the FundSettingsAdded event was emitted
    assertEvent(receipt, 'FundSettingsAdded', {
      comptrollerProxy: mockComptrollerProxy,
      scaledPerSecondRate,
    });

    // managementFeeRate should be set for comptrollerProxy
    const getFeeInfoForFundCall = await managementFee.getFeeInfoForFund(mockComptrollerProxy);
    expect(getFeeInfoForFundCall).toMatchFunctionOutput(managementFee.getFeeInfoForFund, {
      scaledPerSecondRate,
      lastSettled: BigNumber.from(0),
    });
  });
});

describe('activateForFund', () => {
  let fork: ProtocolDeployment;
  let managementFee: ManagementFee;
  let mockComptrollerProxy: MockContract<ComptrollerLib>;
  let mockVaultProxy: MockContract<VaultLib>;
  let scaledPerSecondRate: BigNumberish;

  beforeAll(async () => {
    fork = await deployProtocolFixture();

    const mocks = await createMocksForManagementConfig(fork);
    mockComptrollerProxy = mocks.mockComptrollerProxy;
    mockVaultProxy = mocks.mockVaultProxy;

    const managementFeeRate = utils.parseEther('0.1'); // 10%
    scaledPerSecondRate = convertRateToScaledPerSecondRate(managementFeeRate);
    managementFee = await deployAndConfigureStandaloneManagementFee(fork, {
      comptrollerProxy: mockComptrollerProxy,
      scaledPerSecondRate,
    });
  });

  it('can only be called by the FeeManager', async () => {
    const [randomUser] = fork.accounts;

    await expect(
      managementFee.connect(randomUser).activateForFund(mockComptrollerProxy, mockVaultProxy),
    ).rejects.toBeRevertedWith('Only the FeeManger can make this call');
  });

  // i.e., a new fund
  it('correctly handles valid call for a fund with no shares (does nothing)', async () => {
    // Activate fund
    const receipt = await managementFee.activateForFund(mockComptrollerProxy, mockVaultProxy);

    // Assert lastSettled has not been set
    const getFeeInfoForFundCall = await managementFee.getFeeInfoForFund(mockComptrollerProxy);
    expect(getFeeInfoForFundCall).toMatchFunctionOutput(managementFee.getFeeInfoForFund, {
      lastSettled: 0,
      scaledPerSecondRate,
    });

    // Assert no event emitted
    const events = extractEvent(receipt, 'ActivatedForMigratedFund');
    expect(events.length).toBe(0);
  });

  // i.e., a migrated fund
  it('correctly handles valid call for a fund with no shares (sets lastSettled)', async () => {
    // Set the shares supply to be > 0
    await mockVaultProxy.totalSupply.returns(1);

    // Activate fund
    const receipt = await managementFee.activateForFund(mockComptrollerProxy, mockVaultProxy);

    // Assert lastSettled has been set to the tx timestamp
    const activationTimestamp = await transactionTimestamp(receipt);
    const getFeeInfoForFundCall = await managementFee.getFeeInfoForFund(mockComptrollerProxy);
    expect(getFeeInfoForFundCall).toMatchFunctionOutput(managementFee.getFeeInfoForFund, {
      lastSettled: activationTimestamp,
      scaledPerSecondRate,
    });

    // Assert correct event emitted
    assertEvent(receipt, 'ActivatedForMigratedFund', {
      comptrollerProxy: mockComptrollerProxy,
    });
  });
});

describe('payout', () => {
  it('returns false', async () => {
    const fork = await deployProtocolFixture();
    const mocks = await createMocksForManagementConfig(fork);
    const managementFeeRate = utils.parseEther('0.1'); // 10%
    const scaledPerSecondRate = convertRateToScaledPerSecondRate(managementFeeRate);
    const managementFee = await deployAndConfigureStandaloneManagementFee(fork, {
      comptrollerProxy: mocks.mockComptrollerProxy,
      scaledPerSecondRate,
    });

    const payoutCall = await managementFee.payout.args(mocks.mockComptrollerProxy, mocks.mockVaultProxy).call();
    expect(payoutCall).toBe(false);
  });
});

describe('settle', () => {
  let fork: ProtocolDeployment;
  let managementFee: ManagementFee;
  let mockComptrollerProxy: MockContract<ComptrollerLib>;
  let mockVaultProxy: MockContract<VaultLib>;
  let scaledPerSecondRate: BigNumberish;

  beforeAll(async () => {
    fork = await deployProtocolFixture();

    const mocks = await createMocksForManagementConfig(fork);
    mockComptrollerProxy = mocks.mockComptrollerProxy;
    mockVaultProxy = mocks.mockVaultProxy;

    const managementFeeRate = utils.parseEther('0.1'); // 10%
    scaledPerSecondRate = convertRateToScaledPerSecondRate(managementFeeRate);
    managementFee = await deployAndConfigureStandaloneManagementFee(fork, {
      comptrollerProxy: mockComptrollerProxy,
      scaledPerSecondRate,
    });
  });

  it('can only be called by the FeeManager', async () => {
    const [randomUser] = fork.accounts;

    await expect(
      managementFee.connect(randomUser).settle(mockComptrollerProxy, mockVaultProxy, FeeHook.Continuous, '0x', 0),
    ).rejects.toBeRevertedWith('Only the FeeManger can make this call');
  });

  it('correctly handles shares supply of 0', async () => {
    // Check the return value via a call
    const settleCall = await managementFee.settle
      .args(mockComptrollerProxy, mockVaultProxy, FeeHook.Continuous, '0x', 0)
      .call();

    expect(settleCall).toMatchFunctionOutput(managementFee.settle, {
      settlementType_: FeeSettlementType.None,
      sharesDue_: BigNumber.from(0),
    });

    // Send the tx to actually settle
    const receipt = await managementFee.settle(mockComptrollerProxy, mockVaultProxy, FeeHook.Continuous, '0x', 0);
    const settlementTimestamp = await transactionTimestamp(receipt);

    // Settled event emitted
    assertEvent(receipt, 'Settled', {
      comptrollerProxy: mockComptrollerProxy,
      sharesQuantity: BigNumber.from(0),
      secondsSinceSettlement: BigNumber.from(settlementTimestamp),
    });

    // Fee info should be updated with lastSettled, even though no shares were due
    const getFeeInfoForFundCall = await managementFee.getFeeInfoForFund(mockComptrollerProxy);
    expect(getFeeInfoForFundCall).toMatchFunctionOutput(managementFee.getFeeInfoForFund, {
      scaledPerSecondRate,
      lastSettled: BigNumber.from(settlementTimestamp),
    });
  });

  it('correctly handles shares supply > 0', async () => {
    // Settle while shares supply is 0 to set lastSettled
    const receiptOne = await managementFee.settle(mockComptrollerProxy, mockVaultProxy, FeeHook.Continuous, '0x', 0);
    const settlementTimestampOne = await transactionTimestamp(receiptOne);

    // Update shares supply on mock
    const sharesSupply = utils.parseEther('1');
    await mockVaultProxy.totalSupply.returns(sharesSupply);

    // Mine a block after a time delay
    const secondsToWarp = 10;
    await provider.send('evm_increaseTime', [secondsToWarp]);
    await provider.send('evm_mine', []);

    // // Get the expected shares due for a call() to settle()
    // // The call() adds 1 second to the last block timestamp
    // const expectedFeeShares = managementFeeSharesDue({
    //   scaledPerSecondRate,
    //   sharesSupply,
    //   secondsSinceLastSettled: BigNumber.from(secondsToWarp).add(1),
    // });

    // Check the return values via a call() to settle()
    await managementFee.settle.args(mockComptrollerProxy, mockVaultProxy, FeeHook.Continuous, '0x', 0).call();

    // TODO: debug why this call often fails (has to do with the secondsSinceLastSettled calc
    // commented out above)
    // expect(settleCall).toMatchFunctionOutput(standaloneManagementFee.settle, {
    //   settlementType_: FeeSettlementType.Mint,
    //   sharesDue_: expectedFeeShares,
    // });

    // Send the tx to actually settle()
    const receiptTwo = await managementFee.settle(mockComptrollerProxy, mockVaultProxy, FeeHook.Continuous, '0x', 0);
    const settlementTimestampTwo = await transactionTimestamp(receiptTwo);

    // Get the expected shares due for the actual settlement
    const expectedSharesDueForTx = managementFeeSharesDue({
      scaledPerSecondRate,
      sharesSupply,
      secondsSinceLastSettled: BigNumber.from(settlementTimestampTwo).sub(settlementTimestampOne),
    });

    // Settled event emitted with correct settlement values
    assertEvent(receiptTwo, 'Settled', {
      comptrollerProxy: mockComptrollerProxy,
      sharesQuantity: expectedSharesDueForTx,
      secondsSinceSettlement: BigNumber.from(settlementTimestampTwo).sub(settlementTimestampOne),
    });

    // Fee info should be updated with lastSettled, even though no shares were due
    const getFeeInfoForFundCall = await managementFee.getFeeInfoForFund(mockComptrollerProxy);
    expect(getFeeInfoForFundCall).toMatchFunctionOutput(managementFee.getFeeInfoForFund, {
      scaledPerSecondRate,
      lastSettled: BigNumber.from(settlementTimestampTwo),
    });
  });

  it('correctly handles shares outstanding > 0', async () => {
    // Settle while shares supply is 0 to set lastSettled
    const receiptOne = await managementFee.settle(mockComptrollerProxy, mockVaultProxy, FeeHook.Continuous, '0x', 0);
    const settlementTimestampOne = await transactionTimestamp(receiptOne);

    // Update shares supply and add sharesOutstanding to mock vault
    const sharesSupply = utils.parseEther('1');
    await mockVaultProxy.totalSupply.returns(sharesSupply);
    const sharesOutstanding = utils.parseEther('0.1');
    await mockVaultProxy.balanceOf.given(mockVaultProxy).returns(sharesOutstanding);
    const netSharesSupply = sharesSupply.sub(sharesOutstanding);

    // Mine a block after a time delay
    const secondsToWarp = 10;
    await provider.send('evm_increaseTime', [secondsToWarp]);
    await provider.send('evm_mine', []);
    const timestampPostWarp = (await provider.getBlock('latest')).timestamp;

    // Get the expected shares due for a call() to settle()
    // The call() adds 1 second to the last block timestamp
    const expectedFeeShares = managementFeeSharesDue({
      scaledPerSecondRate,
      sharesSupply: netSharesSupply,
      secondsSinceLastSettled: BigNumber.from(timestampPostWarp).sub(settlementTimestampOne),
    });

    // Check the return values via a call() to settle()
    const settleCall = await managementFee.settle
      .args(mockComptrollerProxy, mockVaultProxy, FeeHook.Continuous, '0x', 0)
      .call();

    expect(settleCall).toMatchFunctionOutput(managementFee.settle, {
      settlementType_: FeeSettlementType.Mint,
      sharesDue_: expectedFeeShares,
    });

    // Send the tx to actually settle()
    const receiptTwo = await managementFee.settle(mockComptrollerProxy, mockVaultProxy, FeeHook.Continuous, '0x', 0);
    const settlementTimestampTwo = await transactionTimestamp(receiptTwo);

    // Get the expected shares due for the actual settlement
    const expectedSharesDueForTx = managementFeeSharesDue({
      scaledPerSecondRate,
      sharesSupply: netSharesSupply,
      secondsSinceLastSettled: BigNumber.from(settlementTimestampTwo).sub(settlementTimestampOne),
    });

    // Settled event emitted with correct settlement values
    assertEvent(receiptTwo, 'Settled', {
      comptrollerProxy: mockComptrollerProxy,
      sharesQuantity: expectedSharesDueForTx,
      secondsSinceSettlement: BigNumber.from(settlementTimestampTwo).sub(settlementTimestampOne),
    });

    // Fee info should be updated with lastSettled, even though no shares were due
    const getFeeInfoForFundCall = await managementFee.getFeeInfoForFund(mockComptrollerProxy);
    expect(getFeeInfoForFundCall).toMatchFunctionOutput(managementFee.getFeeInfoForFund, {
      scaledPerSecondRate,
      lastSettled: BigNumber.from(settlementTimestampTwo),
    });
  });
});

describe('utils', () => {
  it('correctly converts a rate to scaledPerSecondRate and back', async () => {
    const initialRate = utils.parseEther(`0.01`);
    const scaledPerSecondRate = convertRateToScaledPerSecondRate(initialRate);
    const finalRate = convertScaledPerSecondRateToRate(scaledPerSecondRate);

    expect(initialRate).toEqBigNumber(finalRate);
  });
});
