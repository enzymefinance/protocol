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
  WETH,
} from '@enzymefinance/protocol';
import { assertEvent, deployProtocolFixture, transactionTimestamp } from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

async function snapshot() {
  const {
    accounts: [EOAFeeManager, ...remainingAccounts],
    deployment,
    config,
    deployer,
  } = await deployProtocolFixture();

  const denominationAsset = new WETH(config.weth, whales.weth);

  // Create standalone ManagementFee
  const standaloneManagementFee = await ManagementFee.deploy(deployer, EOAFeeManager);

  // Mock a VaultProxy
  const mockVaultProxy = await VaultLib.mock(deployer);
  await mockVaultProxy.totalSupply.returns(0);
  await mockVaultProxy.balanceOf.returns(0);

  // Mock a ComptrollerProxy
  const mockComptrollerProxy = await ComptrollerLib.mock(deployer);
  await mockComptrollerProxy.getVaultProxy.returns(mockVaultProxy);

  // Add fee settings for ComptrollerProxy
  const managementFeeRate = utils.parseEther('0.1'); // 10%
  const scaledPerSecondRate = convertRateToScaledPerSecondRate(managementFeeRate);
  const managementFeeConfig = managementFeeConfigArgs(scaledPerSecondRate);
  await standaloneManagementFee.connect(EOAFeeManager).addFundSettings(mockComptrollerProxy, managementFeeConfig);

  return {
    deployer,
    accounts: remainingAccounts,
    config,
    deployment,
    EOAFeeManager,
    managementFeeRate,
    scaledPerSecondRate,
    mockComptrollerProxy,
    mockVaultProxy,
    standaloneManagementFee,
    denominationAsset,
  };
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      deployment: { feeManager, managementFee },
    } = await provider.snapshot(snapshot);

    const getFeeManagerCall = await managementFee.getFeeManager();
    expect(getFeeManagerCall).toMatchAddress(feeManager);

    // Implements expected hooks
    const implementedHooksCall = await managementFee.implementedHooks();
    expect(implementedHooksCall).toMatchFunctionOutput(managementFee.implementedHooks.fragment, {
      implementedHooksForSettle_: [FeeHook.Continuous, FeeHook.PreBuyShares, FeeHook.PreRedeemShares],
      implementedHooksForUpdate_: [],
      usesGavOnSettle_: false,
      usesGavOnUpdate_: false,
    });
  });
});

describe('activateForFund', () => {
  it('can only be called by the FeeManager', async () => {
    const { mockComptrollerProxy, mockVaultProxy, standaloneManagementFee } = await provider.snapshot(snapshot);

    await expect(
      standaloneManagementFee.activateForFund(mockComptrollerProxy, mockVaultProxy),
    ).rejects.toBeRevertedWith('Only the FeeManger can make this call');
  });

  // i.e., a new fund
  it('correctly handles valid call for a fund with no shares (does nothing)', async () => {
    const {
      EOAFeeManager,
      mockComptrollerProxy,
      mockVaultProxy,
      scaledPerSecondRate,
      standaloneManagementFee,
    } = await provider.snapshot(snapshot);

    // Activate fund
    await standaloneManagementFee.connect(EOAFeeManager).activateForFund(mockComptrollerProxy, mockVaultProxy);

    // Assert lastSettled has not been set
    const getFeeInfoForFundCall = await standaloneManagementFee.getFeeInfoForFund(mockComptrollerProxy);
    expect(getFeeInfoForFundCall).toMatchFunctionOutput(standaloneManagementFee.getFeeInfoForFund, {
      lastSettled: 0,
      scaledPerSecondRate,
    });
  });

  // i.e., a migrated fund
  it('correctly handles valid call for a fund with no shares (sets lastSettled)', async () => {
    const {
      EOAFeeManager,
      mockComptrollerProxy,
      mockVaultProxy,
      scaledPerSecondRate,
      standaloneManagementFee,
    } = await provider.snapshot(snapshot);

    // Set the shares supply to be > 0
    await mockVaultProxy.totalSupply.returns(1);

    // Activate fund
    const receipt = await standaloneManagementFee
      .connect(EOAFeeManager)
      .activateForFund(mockComptrollerProxy, mockVaultProxy);

    // Assert lastSettled has been set to the tx timestamp
    const activationTimestamp = await transactionTimestamp(receipt);
    const getFeeInfoForFundCall = await standaloneManagementFee.getFeeInfoForFund(mockComptrollerProxy);
    expect(getFeeInfoForFundCall).toMatchFunctionOutput(standaloneManagementFee.getFeeInfoForFund, {
      lastSettled: activationTimestamp,
      scaledPerSecondRate,
    });
  });
});

describe('addFundSettings', () => {
  it('can only be called by the FeeManager', async () => {
    const { scaledPerSecondRate, mockComptrollerProxy, standaloneManagementFee } = await provider.snapshot(snapshot);

    const managementFeeConfig = managementFeeConfigArgs(scaledPerSecondRate);
    await expect(
      standaloneManagementFee.addFundSettings(mockComptrollerProxy, managementFeeConfig),
    ).rejects.toBeRevertedWith('Only the FeeManger can make this call');
  });

  it('sets initial config values for fund and fires events', async () => {
    const {
      EOAFeeManager,
      scaledPerSecondRate,
      mockComptrollerProxy,
      standaloneManagementFee,
    } = await provider.snapshot(snapshot);

    const managementFeeConfig = managementFeeConfigArgs(scaledPerSecondRate);
    const receipt = await standaloneManagementFee
      .connect(EOAFeeManager)
      .addFundSettings(mockComptrollerProxy, managementFeeConfig);

    // Assert the FundSettingsAdded event was emitted
    assertEvent(receipt, 'FundSettingsAdded', {
      comptrollerProxy: mockComptrollerProxy,
      scaledPerSecondRate,
    });

    // managementFeeRate should be set for comptrollerProxy
    const getFeeInfoForFundCall = await standaloneManagementFee.getFeeInfoForFund(mockComptrollerProxy);
    expect(getFeeInfoForFundCall).toMatchFunctionOutput(standaloneManagementFee.getFeeInfoForFund, {
      scaledPerSecondRate,
      lastSettled: BigNumber.from(0),
    });
  });
});

describe('payout', () => {
  it('returns false', async () => {
    const { mockComptrollerProxy, mockVaultProxy, standaloneManagementFee } = await provider.snapshot(snapshot);

    const payoutCall = await standaloneManagementFee.payout.args(mockComptrollerProxy, mockVaultProxy).call();
    expect(payoutCall).toBe(false);
  });
});

describe('settle', () => {
  it('can only be called by the FeeManager', async () => {
    const { mockComptrollerProxy, mockVaultProxy, standaloneManagementFee } = await provider.snapshot(snapshot);

    await expect(
      standaloneManagementFee.settle(mockComptrollerProxy, mockVaultProxy, FeeHook.Continuous, '0x', 0),
    ).rejects.toBeRevertedWith('Only the FeeManger can make this call');
  });

  it('correctly handles shares supply of 0', async () => {
    const {
      EOAFeeManager,
      scaledPerSecondRate,
      mockComptrollerProxy,
      mockVaultProxy,
      standaloneManagementFee,
    } = await provider.snapshot(snapshot);

    // Check the return value via a call
    const settleCall = await standaloneManagementFee
      .connect(EOAFeeManager)
      .settle.args(mockComptrollerProxy, mockVaultProxy, FeeHook.Continuous, '0x', 0)
      .call();

    expect(settleCall).toMatchFunctionOutput(standaloneManagementFee.settle, {
      settlementType_: FeeSettlementType.None,
      sharesDue_: BigNumber.from(0),
    });

    // Send the tx to actually settle
    const receipt = await standaloneManagementFee
      .connect(EOAFeeManager)
      .settle(mockComptrollerProxy, mockVaultProxy, FeeHook.Continuous, '0x', 0);
    const settlementTimestamp = await transactionTimestamp(receipt);

    // Settled event emitted
    assertEvent(receipt, 'Settled', {
      comptrollerProxy: mockComptrollerProxy,
      sharesQuantity: BigNumber.from(0),
      secondsSinceSettlement: BigNumber.from(settlementTimestamp),
    });

    // Fee info should be updated with lastSettled, even though no shares were due
    const getFeeInfoForFundCall = await standaloneManagementFee.getFeeInfoForFund(mockComptrollerProxy);
    expect(getFeeInfoForFundCall).toMatchFunctionOutput(standaloneManagementFee.getFeeInfoForFund, {
      scaledPerSecondRate,
      lastSettled: BigNumber.from(settlementTimestamp),
    });
  });

  it('correctly handles shares supply > 0', async () => {
    const {
      EOAFeeManager,
      scaledPerSecondRate,
      mockComptrollerProxy,
      mockVaultProxy,
      standaloneManagementFee,
    } = await provider.snapshot(snapshot);

    // Settle while shares supply is 0 to set lastSettled
    const receiptOne = await standaloneManagementFee
      .connect(EOAFeeManager)
      .settle(mockComptrollerProxy, mockVaultProxy, FeeHook.Continuous, '0x', 0);
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
    await standaloneManagementFee
      .connect(EOAFeeManager)
      .settle.args(mockComptrollerProxy, mockVaultProxy, FeeHook.Continuous, '0x', 0)
      .call();

    // TODO: debug why this call often fails (has to do with the secondsSinceLastSettled calc
    // commented out above)
    // expect(settleCall).toMatchFunctionOutput(standaloneManagementFee.settle, {
    //   settlementType_: FeeSettlementType.Mint,
    //   sharesDue_: expectedFeeShares,
    // });

    // Send the tx to actually settle()
    const receiptTwo = await standaloneManagementFee
      .connect(EOAFeeManager)
      .settle(mockComptrollerProxy, mockVaultProxy, FeeHook.Continuous, '0x', 0);
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
    const getFeeInfoForFundCall = await standaloneManagementFee.getFeeInfoForFund(mockComptrollerProxy);
    expect(getFeeInfoForFundCall).toMatchFunctionOutput(standaloneManagementFee.getFeeInfoForFund, {
      scaledPerSecondRate,
      lastSettled: BigNumber.from(settlementTimestampTwo),
    });
  });

  it('correctly handles shares outstanding > 0', async () => {
    const {
      EOAFeeManager,
      scaledPerSecondRate,
      mockComptrollerProxy,
      mockVaultProxy,
      standaloneManagementFee,
    } = await provider.snapshot(snapshot);

    // Settle while shares supply is 0 to set lastSettled
    const receiptOne = await standaloneManagementFee
      .connect(EOAFeeManager)
      .settle(mockComptrollerProxy, mockVaultProxy, FeeHook.Continuous, '0x', 0);
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
    const settleCall = await standaloneManagementFee
      .connect(EOAFeeManager)
      .settle.args(mockComptrollerProxy, mockVaultProxy, FeeHook.Continuous, '0x', 0)
      .call();

    expect(settleCall).toMatchFunctionOutput(standaloneManagementFee.settle, {
      settlementType_: FeeSettlementType.Mint,
      sharesDue_: expectedFeeShares,
    });

    // Send the tx to actually settle()
    const receiptTwo = await standaloneManagementFee
      .connect(EOAFeeManager)
      .settle(mockComptrollerProxy, mockVaultProxy, FeeHook.Continuous, '0x', 0);
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
    const getFeeInfoForFundCall = await standaloneManagementFee.getFeeInfoForFund(mockComptrollerProxy);
    expect(getFeeInfoForFundCall).toMatchFunctionOutput(standaloneManagementFee.getFeeInfoForFund, {
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
