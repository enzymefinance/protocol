import {
  ComptrollerLib,
  convertRateToScaledPerSecondRate,
  convertScaledPerSecondRateToRate,
  FeeHook,
  FeeManagerActionId,
  feeManagerConfigArgs,
  FeeSettlementType,
  ManagementFee,
  managementFeeConfigArgs,
  managementFeeSharesDue,
  VaultLib,
  WETH,
} from '@enzymefinance/protocol';
import {
  assertEvent,
  buyShares,
  callOnExtension,
  createFundDeployer,
  createMigratedFundConfig,
  createNewFund,
  deployProtocolFixture,
  redeemShares,
  transactionTimestamp,
} from '@enzymefinance/testutils';
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
      implementedHooksForSettle_: [FeeHook.Continuous, FeeHook.BuySharesSetup, FeeHook.PreRedeemShares],
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
    const { EOAFeeManager, mockComptrollerProxy, mockVaultProxy, scaledPerSecondRate, standaloneManagementFee } =
      await provider.snapshot(snapshot);

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
    const { EOAFeeManager, mockComptrollerProxy, mockVaultProxy, scaledPerSecondRate, standaloneManagementFee } =
      await provider.snapshot(snapshot);

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
    const { EOAFeeManager, scaledPerSecondRate, mockComptrollerProxy, standaloneManagementFee } =
      await provider.snapshot(snapshot);

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
    const { EOAFeeManager, scaledPerSecondRate, mockComptrollerProxy, mockVaultProxy, standaloneManagementFee } =
      await provider.snapshot(snapshot);

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
    const { EOAFeeManager, scaledPerSecondRate, mockComptrollerProxy, mockVaultProxy, standaloneManagementFee } =
      await provider.snapshot(snapshot);

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
    const { EOAFeeManager, scaledPerSecondRate, mockComptrollerProxy, mockVaultProxy, standaloneManagementFee } =
      await provider.snapshot(snapshot);

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

describe('integration', () => {
  it('can create a new fund with this fee, works correctly while buying shares', async () => {
    const {
      denominationAsset,
      accounts: [fundOwner, fundInvestor],
      deployment: { feeManager, fundDeployer, managementFee },
    } = await provider.snapshot(snapshot);

    const investmentAmount = utils.parseEther('1');
    await denominationAsset.transfer(fundInvestor, investmentAmount);

    const rate = utils.parseEther('0.1'); // 10%
    const scaledPerSecondRate = convertRateToScaledPerSecondRate(rate);

    const managementFeeSettings = managementFeeConfigArgs(scaledPerSecondRate);
    const feeManagerConfigData = feeManagerConfigArgs({
      fees: [managementFee],
      settings: [managementFeeSettings],
    });

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundDeployer,
      denominationAsset,
      fundOwner,
      fundName: 'Test Fund!',
      feeManagerConfig: feeManagerConfigData,
    });

    const feeInfo = await managementFee.getFeeInfoForFund(comptrollerProxy.address);
    expect(feeInfo.scaledPerSecondRate).toEqBigNumber(scaledPerSecondRate);

    // Buying shares of the fund
    const buySharesReceipt = await buyShares({
      comptrollerProxy,
      signer: fundInvestor,
      buyers: [fundInvestor],
      denominationAsset,
      investmentAmounts: [investmentAmount],
      minSharesAmounts: [utils.parseEther('1')],
    });

    // Mine a block after a time delay
    const secondsToWarp = 10;
    await provider.send('evm_increaseTime', [secondsToWarp]);
    await provider.send('evm_mine', []);

    const sharesBeforePayout = await vaultProxy.totalSupply();

    const settleFeesReceipt = await callOnExtension({
      signer: fundOwner,
      comptrollerProxy,
      extension: feeManager,
      actionId: FeeManagerActionId.InvokeContinuousHook,
    });

    const buySharesTimestamp = await transactionTimestamp(buySharesReceipt);
    const settleFeesTimestamp = await transactionTimestamp(settleFeesReceipt);
    const elapsedSecondsBetweenBuyAndSettle = BigNumber.from(settleFeesTimestamp - buySharesTimestamp);

    // Get the expected fee shares for the elapsed time
    const expectedFeeShares = managementFeeSharesDue({
      scaledPerSecondRate,
      sharesSupply: utils.parseEther('1'),
      secondsSinceLastSettled: elapsedSecondsBetweenBuyAndSettle,
    });

    const sharesAfterPayout = await vaultProxy.totalSupply();
    const sharesMinted = sharesAfterPayout.sub(sharesBeforePayout);

    // Check that the expected shares due have been minted
    expect(sharesMinted).toEqBigNumber(expectedFeeShares);

    // Check that the fundOwner has received these minted shares
    const fundOwnerBalance = await vaultProxy.balanceOf(fundOwner);
    expect(fundOwnerBalance).toEqBigNumber(expectedFeeShares);
  });

  it('can create a new fund with this fee, works correctly while buying and then redeeming shares', async () => {
    const {
      denominationAsset,
      accounts: [fundOwner, fundInvestor],
      deployment: { fundDeployer, managementFee },
    } = await provider.snapshot(snapshot);

    const investmentAmount = utils.parseEther('1');
    await denominationAsset.transfer(fundInvestor, investmentAmount);

    const rate = utils.parseEther('0.1'); // 10%
    const scaledPerSecondRate = convertRateToScaledPerSecondRate(rate);

    const managementFeeSettings = managementFeeConfigArgs(scaledPerSecondRate);
    const feeManagerConfigData = feeManagerConfigArgs({
      fees: [managementFee],
      settings: [managementFeeSettings],
    });

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundDeployer,
      denominationAsset,
      fundOwner,
      fundName: 'Test Fund!',
      feeManagerConfig: feeManagerConfigData,
    });

    const feeInfo = await managementFee.getFeeInfoForFund(comptrollerProxy.address);
    expect(feeInfo.scaledPerSecondRate).toEqBigNumber(scaledPerSecondRate);

    // Buying shares of the fund
    const buySharesReceipt = await buyShares({
      comptrollerProxy,
      signer: fundInvestor,
      buyers: [fundInvestor],
      denominationAsset,
      investmentAmounts: [investmentAmount],
      minSharesAmounts: [utils.parseEther('1')],
    });

    // Mine a block after a time delay
    const secondsToWarp = 10;
    await provider.send('evm_increaseTime', [secondsToWarp]);
    await provider.send('evm_mine', []);

    // Redeem all fundInvestor shares
    const redeemSharesReceipt = await redeemShares({
      comptrollerProxy,
      signer: fundInvestor,
    });

    const buySharesTimestamp = await transactionTimestamp(buySharesReceipt);
    const redeemSharesTimestamp = await transactionTimestamp(redeemSharesReceipt);
    const secondsElapsedBetweenBuyAndRedeem = BigNumber.from(redeemSharesTimestamp - buySharesTimestamp);

    // Get the expected shares fee shares
    const expectedFeeShares = managementFeeSharesDue({
      scaledPerSecondRate,
      sharesSupply: utils.parseEther('1'),
      secondsSinceLastSettled: BigNumber.from(secondsElapsedBetweenBuyAndRedeem),
    });

    // Shares minted are what's left when we subtract the only investor has redeemed all shares
    const sharesMinted = await vaultProxy.totalSupply();

    // Check that the expected shares due  have been minted
    expect(sharesMinted).toEqBigNumber(expectedFeeShares);

    // Check that the fundOwner has received these shares
    const fundOwnerBalance = await vaultProxy.balanceOf(fundOwner);
    expect(fundOwnerBalance).toEqBigNumber(expectedFeeShares);
  });

  it('can migrate a fund with this fee, buying shares after migration', async () => {
    const {
      deployer,
      accounts: [fundOwner, fundInvestor],
      config: {
        synthetix: { addressResolver: synthetixAddressResolverAddress },
      },
      denominationAsset,
      deployment: {
        chainlinkPriceFeed,
        dispatcher,
        feeManager,
        fundDeployer,
        integrationManager,
        managementFee,
        policyManager,
        synthetixPriceFeed,
        valueInterpreter,
        vaultLib,
      },
      scaledPerSecondRate,
    } = await provider.snapshot(snapshot);

    const investmentAmount = utils.parseEther('1');
    await denominationAsset.transfer(fundInvestor, investmentAmount);

    const managementFeeSettings = managementFeeConfigArgs(scaledPerSecondRate);
    const feeManagerConfigData = feeManagerConfigArgs({
      fees: [managementFee],
      settings: [managementFeeSettings],
    });

    const { vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundDeployer,
      denominationAsset,
      fundOwner,
      fundName: 'Test Fund!',
      feeManagerConfig: feeManagerConfigData,
    });

    const nextFundDeployer = await createFundDeployer({
      deployer,
      chainlinkPriceFeed,
      dispatcher,
      feeManager,
      integrationManager,
      policyManager,
      synthetixPriceFeed,
      synthetixAddressResolverAddress,
      valueInterpreter,
      vaultLib,
    });

    const { comptrollerProxy: nextComptrollerProxy } = await createMigratedFundConfig({
      signer: fundOwner,
      fundDeployer: nextFundDeployer,
      denominationAsset,
      feeManagerConfigData,
    });

    const signedNextFundDeployer = nextFundDeployer.connect(fundOwner);
    await signedNextFundDeployer.signalMigration(vaultProxy, nextComptrollerProxy);

    // Warp to migratable time
    const migrationTimelock = await dispatcher.getMigrationTimelock();
    await provider.send('evm_increaseTime', [migrationTimelock.toNumber()]);

    await signedNextFundDeployer.executeMigration(vaultProxy);

    const feeInfo = await managementFee.getFeeInfoForFund(nextComptrollerProxy.address);
    expect(feeInfo.scaledPerSecondRate).toEqBigNumber(scaledPerSecondRate);

    // Buying shares of the fund
    const buySharesReceipt = await buyShares({
      comptrollerProxy: nextComptrollerProxy,
      signer: fundInvestor,
      buyers: [fundInvestor],
      denominationAsset,
      investmentAmounts: [investmentAmount],
      minSharesAmounts: [utils.parseEther('1')],
    });

    // Mine a block after a time delay
    const secondsToWarp = 10;
    await provider.send('evm_increaseTime', [secondsToWarp]);
    await provider.send('evm_mine', []);

    const sharesBeforePayout = await vaultProxy.totalSupply();

    const settleFeesReceipt = await callOnExtension({
      signer: fundOwner,
      comptrollerProxy: nextComptrollerProxy,
      extension: feeManager,
      actionId: FeeManagerActionId.InvokeContinuousHook,
    });

    const buySharesTimestamp = await transactionTimestamp(buySharesReceipt);
    const settleFeesTimestamp = await transactionTimestamp(settleFeesReceipt);
    const elapsedSecondsBetweenBuyAndSettle = BigNumber.from(settleFeesTimestamp - buySharesTimestamp);

    // Get the expected fee shares for the elapsed time
    const expectedFeeShares = managementFeeSharesDue({
      scaledPerSecondRate,
      sharesSupply: utils.parseEther('1'),
      secondsSinceLastSettled: elapsedSecondsBetweenBuyAndSettle,
    });

    const sharesAfterPayout = await vaultProxy.totalSupply();
    const sharesMinted = sharesAfterPayout.sub(sharesBeforePayout);

    // Check that the expected shares due  have been minted
    expect(sharesMinted).toEqBigNumber(expectedFeeShares);

    // Check that the fundOwner has received these shares
    const fundOwnerBalance = await vaultProxy.balanceOf(fundOwner);
    expect(fundOwnerBalance).toEqBigNumber(expectedFeeShares);
  });

  it('can migrate a fund with this fee, buying shares before migration', async () => {
    const {
      deployer,
      accounts: [fundOwner, fundInvestor],
      config: {
        synthetix: { addressResolver: synthetixAddressResolverAddress },
      },
      denominationAsset,
      deployment: {
        chainlinkPriceFeed,
        dispatcher,
        feeManager,
        fundDeployer,
        integrationManager,
        managementFee,
        policyManager,
        synthetixPriceFeed,
        valueInterpreter,
        vaultLib,
      },
      scaledPerSecondRate,
    } = await provider.snapshot(snapshot);

    const investmentAmount = utils.parseEther('1');
    await denominationAsset.transfer(fundInvestor, investmentAmount);

    const managementFeeSettings = managementFeeConfigArgs(scaledPerSecondRate);
    const feeManagerConfigData = feeManagerConfigArgs({
      fees: [managementFee],
      settings: [managementFeeSettings],
    });

    const { vaultProxy, comptrollerProxy } = await createNewFund({
      signer: fundOwner,
      fundDeployer,
      denominationAsset,
      fundOwner,
      fundName: 'Test Fund!',
      feeManagerConfig: feeManagerConfigData,
    });

    // Buying shares of the fund
    const buySharesReceipt = await buyShares({
      comptrollerProxy: comptrollerProxy,
      signer: fundInvestor,
      buyers: [fundInvestor],
      denominationAsset,
      investmentAmounts: [investmentAmount],
      minSharesAmounts: [utils.parseEther('1')],
    });

    const sharesBeforePayout = await vaultProxy.totalSupply(); // 1.0

    const nextFundDeployer = await createFundDeployer({
      deployer,
      chainlinkPriceFeed,
      dispatcher,
      feeManager,
      integrationManager,
      policyManager,
      synthetixPriceFeed,
      synthetixAddressResolverAddress,
      valueInterpreter,
      vaultLib,
    });

    const { comptrollerProxy: nextComptrollerProxy } = await createMigratedFundConfig({
      signer: fundOwner,
      fundDeployer: nextFundDeployer,
      denominationAsset,
      feeManagerConfigData,
    });

    const signedNextFundDeployer = nextFundDeployer.connect(fundOwner);
    await signedNextFundDeployer.signalMigration(vaultProxy, nextComptrollerProxy);

    // Warp to migratable time
    const migrationTimelock = await dispatcher.getMigrationTimelock();
    await provider.send('evm_increaseTime', [migrationTimelock.toNumber()]);

    // Migration execution settles the accrued fee
    const executeMigrationReceipt = await signedNextFundDeployer.executeMigration(vaultProxy);

    const feeInfo = await managementFee.getFeeInfoForFund(comptrollerProxy.address);
    expect(feeInfo.scaledPerSecondRate).toEqBigNumber(scaledPerSecondRate);

    const sharesAfterPayout = await vaultProxy.totalSupply();
    const sharesMinted = sharesAfterPayout.sub(sharesBeforePayout);

    const buySharesTimestamp = await transactionTimestamp(buySharesReceipt);
    const migrationTimestamp = await transactionTimestamp(executeMigrationReceipt);
    const secondsElapsedBetweenBuyAndMigrate = BigNumber.from(migrationTimestamp - buySharesTimestamp);

    // Get the expected shares due
    const expectedSharesDue = managementFeeSharesDue({
      scaledPerSecondRate,
      sharesSupply: utils.parseEther('1'), // 1.0
      secondsSinceLastSettled: secondsElapsedBetweenBuyAndMigrate,
    });

    // Check that the expected shares due have been minted
    expect(sharesMinted).toEqBigNumber(expectedSharesDue);

    // Check that the fundOwner has received these shares
    const fundOwnerBalance = await vaultProxy.balanceOf(fundOwner);
    expect(fundOwnerBalance).toEqBigNumber(expectedSharesDue);
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
