import { extractEvent } from '@enzymefinance/ethers';
import {
  IMigrationHookHandler,
  MockVaultLib,
  IFee,
  settlePreBuySharesArgs,
  feeManagerConfigArgs,
  FeeSettlementType,
  FeeHook,
  FeeManagerActionId,
  payoutSharesOutstandingForFeesArgs,
  WETH,
} from '@enzymefinance/protocol';
import {
  assertEvent,
  buyShares,
  callOnExtension,
  createNewFund,
  generateRegisteredMockFees,
  assertNoEvent,
  deployProtocolFixture,
} from '@enzymefinance/testutils';
import { BigNumber, constants, utils } from 'ethers';

async function snapshot() {
  const {
    accounts: [fundOwner, ...remainingAccounts],
    deployment,
    config,
    deployer,
  } = await deployProtocolFixture();

  const fees = await generateRegisteredMockFees({
    deployer,
    feeManager: deployment.feeManager,
  });

  const denominationAsset = new WETH(config.weth, whales.weth);

  const createFund = () => {
    const feesSettingsData = [utils.randomBytes(10), utils.randomBytes(2), constants.HashZero];

    const feeManagerConfig = feeManagerConfigArgs({
      fees: Object.values(fees),
      settings: feesSettingsData,
    });

    return createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: deployment.fundDeployer,
      denominationAsset,
      feeManagerConfig,
    });
  };

  return {
    accounts: remainingAccounts,
    deployer,
    config,
    deployment,
    fees,
    denominationAsset,
    fundOwner,
    createFund,
  };
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      deployment: {
        feeManager,
        fundDeployer,
        entranceRateBurnFee,
        entranceRateDirectFee,
        managementFee,
        performanceFee,
      },
      fees,
    } = await provider.snapshot(snapshot);

    const getRegisteredFeesCall = await feeManager.getRegisteredFees();
    expect(getRegisteredFeesCall).toMatchFunctionOutput(feeManager.getRegisteredFees, [
      entranceRateDirectFee,
      entranceRateBurnFee,
      managementFee,
      performanceFee,
      ...Object.values(fees),
    ]);

    const fundDeployerOwner = await fundDeployer.getOwner();
    const getOwnerCall = await feeManager.getOwner();
    expect(getOwnerCall).toMatchAddress(fundDeployerOwner);
  });
});

describe('activateForFund', () => {
  it('stores the validated VaultProxy and calls `activateForFund()` on each Fee', async () => {
    const {
      deployment: { feeManager },
      fees,
      createFund,
    } = await provider.snapshot(snapshot);

    const { vaultProxy, comptrollerProxy } = await createFund();

    // Stores the ComptrollerProxy-VaultProxy pairing
    const getVaultProxyForFundCall = await feeManager.getVaultProxyForFund(comptrollerProxy);
    expect(getVaultProxyForFundCall).toMatchAddress(vaultProxy);

    // Calls each enabled fee to activate
    for (const fee of Object.values(fees)) {
      expect(fee.activateForFund).toHaveBeenCalledOnContractWith(comptrollerProxy, vaultProxy);
    }
  });
});

describe('deactivateForFund', () => {
  it('settles Continuous fees, pays out all shares outstanding, and deletes storage for fund', async () => {
    const {
      accounts: [buyer],
      deployer,
      deployment: { dispatcher, feeManager },
      fees: { mockContinuousFeeSettleOnly, mockContinuousFeeWithGavAndUpdates },
      fundOwner,
      denominationAsset,
      createFund,
    } = await provider.snapshot(snapshot);

    const investmentAmount = utils.parseEther('1');
    await denominationAsset.transfer(buyer, investmentAmount);

    const { vaultProxy, comptrollerProxy } = await createFund();

    // Seed fund with initial fund shares,
    // to give a non-zero totalSupply (so that minting new shares is allowed)
    await buyShares({
      comptrollerProxy,
      signer: buyer,
      buyers: [buyer],
      denominationAsset,
      investmentAmounts: [investmentAmount],
    });

    // All fee settlement amounts are the same
    const feeAmount = utils.parseEther('0.5');

    // Fee 1 mints shares outstanding with no payout ever
    await mockContinuousFeeSettleOnly.settle.returns(
      FeeSettlementType.MintSharesOutstanding,
      constants.AddressZero,
      feeAmount,
    );

    // Fee 2 mints shares directly to manager
    await mockContinuousFeeWithGavAndUpdates.settle.returns(FeeSettlementType.Mint, constants.AddressZero, feeAmount);

    // Setup a new mock release to migrate the fund
    const mockNextFundDeployer = await IMigrationHookHandler.mock(deployer);
    const mockNextVaultAccessor = await IMigrationHookHandler.mock(deployer);
    const mockNextVaultLib = await MockVaultLib.deploy(deployer);
    await dispatcher.setCurrentFundDeployer(mockNextFundDeployer);

    // Signal migration and warp to migratable time
    await mockNextFundDeployer.forward(
      dispatcher.signalMigration,
      vaultProxy,
      mockNextVaultAccessor,
      mockNextVaultLib,
      false,
    );

    const migrationTimelock = await dispatcher.getMigrationTimelock();
    await provider.send('evm_increaseTime', [migrationTimelock.toNumber()]);

    const preFundOwnerSharesCall = await vaultProxy.balanceOf(fundOwner);
    const preSharesOutstandingCall = await vaultProxy.balanceOf(vaultProxy);

    // Migrate the vault
    const receipt = await mockNextFundDeployer.forward(dispatcher.executeMigration, vaultProxy, false);

    // Proper events are fired
    const allSharesOutstandingForcePaidForFundEvent = feeManager.abi.getEvent('AllSharesOutstandingForcePaidForFund');

    assertEvent(receipt, allSharesOutstandingForcePaidForFundEvent, {
      comptrollerProxy: comptrollerProxy,
      payee: fundOwner,
      sharesDue: feeAmount,
    });

    const postFundOwnerSharesCall = await vaultProxy.balanceOf(fundOwner);
    const postSharesOutstandingCall = await vaultProxy.balanceOf(vaultProxy);

    // Fees should be settled and payout of shares outstanding forced
    const expectedPayoutAmount = BigNumber.from(feeAmount).mul(2);
    expect(postFundOwnerSharesCall).toEqBigNumber(preFundOwnerSharesCall.add(expectedPayoutAmount));
    expect(postSharesOutstandingCall).toEqBigNumber(preSharesOutstandingCall);

    // Fund config should be deleted
    const enabledFeesCall = await feeManager.getEnabledFeesForFund(comptrollerProxy);
    expect(enabledFeesCall).toMatchObject([]);

    const getVaultProxyForFundCall = await feeManager.getVaultProxyForFund(comptrollerProxy);
    expect(getVaultProxyForFundCall).toMatchAddress(constants.AddressZero);
  });
});

describe('receiveCallFromComptroller', () => {
  it('does not allow an invalid _actionId', async () => {
    const {
      deployment: { feeManager },
      createFund,
    } = await provider.snapshot(snapshot);

    const { comptrollerProxy } = await createFund();

    // Calling with invalid actionID
    const actionId = 123;
    const callOnExtensionCall = callOnExtension({ comptrollerProxy, extension: feeManager, actionId });
    await expect(callOnExtensionCall).rejects.toBeRevertedWith('Invalid _actionId');
  });

  it('calls the correct action for actionId', async () => {
    const {
      accounts: [fundInvestor],
      deployment: { feeManager },
      fees: { mockContinuousFeeSettleOnly },
      createFund,
      fundOwner,
      denominationAsset,
    } = await provider.snapshot(snapshot);

    const investmentAmount = utils.parseEther('1');
    await denominationAsset.transfer(fundInvestor, investmentAmount);

    const { comptrollerProxy } = await createFund();

    // Buy shares of the fund so that fees accrue
    await buyShares({
      comptrollerProxy,
      signer: fundInvestor,
      buyers: [fundInvestor],
      denominationAsset,
      investmentAmounts: [investmentAmount],
    });

    // Mint mock continuous fee
    await mockContinuousFeeSettleOnly.settle.returns(
      FeeSettlementType.Mint,
      constants.AddressZero,
      utils.parseEther('0.5'),
    );

    // Settling the fee
    const receipt = await callOnExtension({
      comptrollerProxy,
      extension: feeManager,
      actionId: FeeManagerActionId.InvokeContinuousHook,
    });

    // Check that the FeeSettledForFund event has been emitted
    const feeSettledForFundEvent = feeManager.abi.getEvent('FeeSettledForFund');
    assertEvent(receipt, feeSettledForFundEvent, {
      settlementType: FeeSettlementType.Mint,
      comptrollerProxy,
      fee: mockContinuousFeeSettleOnly,
      payer: constants.AddressZero,
      payee: fundOwner,
      sharesDue: expect.anything(),
    });
  });
});

describe('setConfigForFund', () => {
  it('does not allow unequal fees and settingsData array lengths', async () => {
    const {
      denominationAsset,
      accounts: [fundOwner],
      deployment: { fundDeployer },
      fees: { mockContinuousFeeSettleOnly, mockContinuousFeeWithGavAndUpdates },
    } = await provider.snapshot(snapshot);

    // Fees array of length 2, feesSettingsData of length 3
    const fees = [mockContinuousFeeSettleOnly, mockContinuousFeeWithGavAndUpdates];
    const feesSettingsData = [utils.randomBytes(10), utils.randomBytes(2), constants.HashZero];

    const feeManagerConfig = feeManagerConfigArgs({
      fees: fees,
      settings: feesSettingsData,
    });

    const createNewFundCall = createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer,
      denominationAsset,
      feeManagerConfig,
    });

    await expect(createNewFundCall).rejects.toBeRevertedWith('fees and settingsData array lengths unequal');
  });

  it('does not allow duplicate fees', async () => {
    const {
      accounts: [fundOwner],
      denominationAsset,
      deployment: { fundDeployer },
      fees: { mockContinuousFeeSettleOnly },
    } = await provider.snapshot(snapshot);

    // Duplicate fees
    const fees = [mockContinuousFeeSettleOnly, mockContinuousFeeSettleOnly];
    const feesSettingsData = [utils.randomBytes(10), utils.randomBytes(10)];

    const feeManagerConfig = feeManagerConfigArgs({
      fees: fees,
      settings: feesSettingsData,
    });

    const createNewFundCall = createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer,
      denominationAsset,
      feeManagerConfig,
    });

    await expect(createNewFundCall).rejects.toBeRevertedWith('fees cannot include duplicates');
  });

  it('does not allow an unregistered fee', async () => {
    const {
      denominationAsset,
      accounts: [fundOwner],
      deployment: { fundDeployer },
    } = await provider.snapshot(snapshot);

    // Unregistered fee
    const fees = [constants.AddressZero];
    const feesSettingsData = [utils.randomBytes(10)];

    const feeManagerConfig = feeManagerConfigArgs({
      fees: fees,
      settings: feesSettingsData,
    });

    const createNewFundCall = createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer,
      denominationAsset,
      feeManagerConfig,
    });

    await expect(createNewFundCall).rejects.toBeRevertedWith('Fee is not registered');
  });

  it('calls `addFundSettings` on each Fee, adds all fees to storage, and fires the correct event per Fee', async () => {
    const {
      denominationAsset,
      accounts: [fundOwner],
      deployment: { feeManager, fundDeployer },
      fees: { mockContinuousFeeSettleOnly, mockContinuousFeeWithGavAndUpdates, mockPostBuySharesFee },
    } = await provider.snapshot(snapshot);

    const fees = [mockContinuousFeeSettleOnly, mockContinuousFeeWithGavAndUpdates, mockPostBuySharesFee];
    const feesSettingsData = [utils.randomBytes(10), utils.randomBytes(2), constants.HashZero];

    const feeManagerConfig = feeManagerConfigArgs({
      fees: fees,
      settings: feesSettingsData,
    });

    const { comptrollerProxy, receipt } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer,
      denominationAsset,
      feeManagerConfig,
    });

    // Assert state for fund
    const getEnabledFeesForFundCall = await feeManager.getEnabledFeesForFund(comptrollerProxy);
    expect(getEnabledFeesForFundCall).toMatchFunctionOutput(feeManager.getEnabledFeesForFund, fees);

    // Assert addFundSettings was called on each fee with its settingsData
    for (let i = 0; i < fees.length; i++) {
      expect(fees[i].addFundSettings).toHaveBeenCalledOnContractWith(comptrollerProxy, feesSettingsData[i]);
    }

    // Assert FeeEnabledForFund events
    const feeEnabledForFundEvent = feeManager.abi.getEvent('FeeEnabledForFund');
    const events = extractEvent(receipt, feeEnabledForFundEvent);
    expect(events.length).toBe(fees.length);
    for (let i = 0; i < fees.length; i++) {
      expect(events[i].args).toMatchObject({
        comptrollerProxy: comptrollerProxy.address,
        fee: fees[i].address,
        settingsData: utils.hexlify(feesSettingsData[i]),
      });
    }
  });
});

describe('invokeHook', () => {
  // TODO: fix this test (not sure if it's doing what it's trying to do)
  xit('does not allow a non-activated fund', async () => {
    const {
      denominationAsset,
      accounts: [fundOwner],
      deployer,
      deployment: { feeManager, fundDeployer },
    } = await provider.snapshot(snapshot);

    // Register new mock fee that will not be activated on fund
    const nonActivatedMockFee = await IFee.mock(deployer);

    await Promise.all([
      nonActivatedMockFee.identifier.returns(`NON_ACTIVATED_MOCK_FEE`),
      nonActivatedMockFee.settle.returns(FeeSettlementType.None, constants.AddressZero, 0),
      nonActivatedMockFee.payout.returns(false),
      nonActivatedMockFee.addFundSettings.returns(undefined),
      nonActivatedMockFee.activateForFund.returns(undefined),
      nonActivatedMockFee.implementedHooks.returns([FeeHook.Continuous, FeeHook.PreBuyShares, FeeHook.PreRedeemShares]),
    ]);

    // Register the mock fee
    await feeManager.registerFees([nonActivatedMockFee]);

    const fees = [nonActivatedMockFee];
    const feesSettingsData = [utils.randomBytes(10)];

    const feeManagerConfig = feeManagerConfigArgs({
      fees: fees,
      settings: feesSettingsData,
    });

    await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer,
      denominationAsset,
      feeManagerConfig,
    });

    const invokeHookCall = feeManager.invokeHook(FeeHook.Continuous, utils.randomBytes(10), 0);
    await expect(invokeHookCall).rejects.toBeRevertedWith('Fund is not active');
  });

  it('finishes silently when no fees of the specified FeeHook are implemented', async () => {
    const {
      accounts: [buyer],
      deployment: { feeManager },
      denominationAsset,
      createFund,
    } = await provider.snapshot(snapshot);

    const investmentAmount = utils.parseEther('2');
    await denominationAsset.transfer(buyer, investmentAmount);

    const { comptrollerProxy } = await createFund();

    // Buy shares
    await buyShares({
      comptrollerProxy,
      signer: buyer,
      buyers: [buyer],
      denominationAsset,
      investmentAmounts: [investmentAmount],
    });

    // Settle fees without having defined fee settlement
    const receipt = await callOnExtension({
      comptrollerProxy,
      extension: feeManager,
      actionId: FeeManagerActionId.InvokeContinuousHook,
    });

    // Assert that no "FeeSettledForFund" event was emitted
    const feeSettledForFundEvent = feeManager.abi.getEvent('FeeSettledForFund');
    assertNoEvent(receipt, feeSettledForFundEvent);
  });

  describe('SettlementTypes', () => {
    describe('SettlementType.None', () => {
      it('does not change shares totalSupply or fund manager balance, and does not emit event', async () => {
        const {
          accounts: [buyer],
          deployment: { feeManager },
          fees: { mockContinuousFeeSettleOnly },
          fundOwner,
          denominationAsset,
          createFund,
        } = await provider.snapshot(snapshot);

        const investmentAmount = utils.parseEther('2');
        await denominationAsset.transfer(buyer, investmentAmount);

        const { vaultProxy, comptrollerProxy } = await createFund();

        // Buying shares
        await buyShares({
          comptrollerProxy,
          signer: buyer,
          buyers: [buyer],
          denominationAsset,
          investmentAmounts: [investmentAmount],
        });

        // Define fee settlement
        const feeAmount = utils.parseEther('0.5');
        const settlementType = FeeSettlementType.None;
        await mockContinuousFeeSettleOnly.settle.returns(settlementType, buyer, feeAmount);

        const preFundOwnerSharesCall = await vaultProxy.balanceOf(fundOwner);
        const preBuyerSharesCall = await vaultProxy.balanceOf(buyer);
        const preTotalSupply = await vaultProxy.totalSupply();

        // Settle fee
        const receipt = await callOnExtension({
          comptrollerProxy,
          extension: feeManager,
          actionId: FeeManagerActionId.InvokeContinuousHook,
        });

        // Assert that no "FeeSettledForFund" event was emitted
        const feeSettledForFundEvent = feeManager.abi.getEvent('FeeSettledForFund');
        assertNoEvent(receipt, feeSettledForFundEvent);

        const postFundOwnerSharesCall = await vaultProxy.balanceOf(fundOwner);
        const postBuyerSharesCall = await vaultProxy.balanceOf(buyer);
        const postTotalSupply = await vaultProxy.totalSupply();

        // The fund owner's balance shouldn't have changed
        expect(postFundOwnerSharesCall).toEqBigNumber(preFundOwnerSharesCall);

        // The buyer's shares shouldn't have changed
        expect(postBuyerSharesCall).toEqBigNumber(preBuyerSharesCall);

        // The total supply shouldn't have changed
        expect(postTotalSupply).toEqBigNumber(preTotalSupply);
      });
    });

    describe('SettlementType.Direct', () => {
      it('transfers shares from payer to payee and emits proper event', async () => {
        const {
          accounts: [buyer],
          deployment: { feeManager },
          fees: { mockPostBuySharesFee },
          fundOwner,
          denominationAsset,
          createFund,
        } = await provider.snapshot(snapshot);

        const investmentAmount = utils.parseEther('2');
        await denominationAsset.transfer(buyer, investmentAmount);

        const { vaultProxy, comptrollerProxy } = await createFund();

        // Define fee settlement
        const feeAmount = utils.parseEther('0.5');
        const settlementType = FeeSettlementType.Direct;
        await mockPostBuySharesFee.settle.returns(settlementType, buyer, feeAmount);

        const preFundOwnerSharesCall = await vaultProxy.balanceOf(fundOwner);
        const preBuyerSharesCall = await vaultProxy.balanceOf(buyer);

        // Buy shares with active fee
        const receipt = await buyShares({
          comptrollerProxy,
          signer: buyer,
          buyers: [buyer],
          denominationAsset,
          investmentAmounts: [investmentAmount],
          minSharesAmounts: [BigNumber.from(investmentAmount).sub(feeAmount)],
        });

        // Assert correct FeeSettledForFund emission for mockPostBuySharesFee
        const feeSettledForFundEvent = feeManager.abi.getEvent('FeeSettledForFund');
        assertEvent(receipt, feeSettledForFundEvent, {
          comptrollerProxy,
          fee: mockPostBuySharesFee,
          settlementType,
          payer: buyer,
          payee: fundOwner,
          sharesDue: feeAmount,
        });

        const postFundOwnerSharesCall = await vaultProxy.balanceOf(fundOwner);
        const postBuyerSharesCall = await vaultProxy.balanceOf(buyer);

        // The feeAmount should be allocated to the fund owner
        expect(postFundOwnerSharesCall).toEqBigNumber(preFundOwnerSharesCall.add(feeAmount));

        // The feeAmount should be deducted from the buyer's shares
        expect(postBuyerSharesCall).toEqBigNumber(preBuyerSharesCall.add(investmentAmount).sub(feeAmount));
      });
    });

    describe('SettlementType.Burn', () => {
      it('burns shares from the payer and emits the correct event', async () => {
        const {
          accounts: [buyer],
          deployment: { feeManager },
          fees: { mockPostBuySharesFee },
          fundOwner,
          denominationAsset,
          createFund,
        } = await provider.snapshot(snapshot);

        const investmentAmount = utils.parseEther('2');
        await denominationAsset.transfer(buyer, investmentAmount);

        const { vaultProxy, comptrollerProxy } = await createFund();

        // Define fee settlement
        const feeAmount = utils.parseEther('0.5');
        const settlementType = FeeSettlementType.Burn;
        await mockPostBuySharesFee.settle.returns(settlementType, buyer, feeAmount);

        const preFundOwnerSharesCall = await vaultProxy.balanceOf(fundOwner);
        const preBuyerSharesCall = await vaultProxy.balanceOf(buyer);
        const preSharesSupplyCall = await vaultProxy.totalSupply();

        // Buy shares with active fee
        const expectedSharesReceived = BigNumber.from(investmentAmount).sub(feeAmount);
        const receipt = await buyShares({
          comptrollerProxy,
          signer: buyer,
          buyers: [buyer],
          denominationAsset,
          investmentAmounts: [investmentAmount],
          minSharesAmounts: [expectedSharesReceived],
        });

        // Assert correct FeeSettledForFund emission for mockPostBuySharesFee
        const feeSettledForFundEvent = feeManager.abi.getEvent('FeeSettledForFund');

        assertEvent(receipt, feeSettledForFundEvent, {
          comptrollerProxy: comptrollerProxy,
          fee: mockPostBuySharesFee,
          settlementType,
          payer: buyer,
          payee: constants.AddressZero,
          sharesDue: feeAmount,
        });

        const postFundOwnerSharesCall = await vaultProxy.balanceOf(fundOwner);
        const postBuyerSharesCall = await vaultProxy.balanceOf(buyer);
        const postSharesSupplyCall = await vaultProxy.totalSupply();

        // The fund owner's shares should not have changed
        expect(postFundOwnerSharesCall).toEqBigNumber(preFundOwnerSharesCall);

        // The feeAmount should be deducted from the buyer's shares
        expect(postBuyerSharesCall).toEqBigNumber(preBuyerSharesCall.add(expectedSharesReceived));

        // The totalSupply should have increased by the shares received
        expect(postSharesSupplyCall).toEqBigNumber(preSharesSupplyCall.add(expectedSharesReceived));
      });
    });

    describe('SettlementType.Mint', () => {
      it('mints new shares to the payee and emits the correct event', async () => {
        const {
          accounts: [randomUser, buyer],
          deployment: { feeManager },
          fees: { mockContinuousFeeSettleOnly },
          fundOwner,
          denominationAsset,
          createFund,
        } = await provider.snapshot(snapshot);

        const investmentAmount = utils.parseEther('1');
        await denominationAsset.transfer(buyer, investmentAmount);

        const { vaultProxy, comptrollerProxy } = await createFund();

        // Seed fund with initial fund shares,
        // to give a non-zero totalSupply (so that minting new shares is allowed)
        await buyShares({
          comptrollerProxy,
          signer: buyer,
          buyers: [buyer],
          denominationAsset,
          investmentAmounts: [investmentAmount],
        });

        // Define fee settlement
        const feeAmount = utils.parseEther('0.5');
        const settlementType = FeeSettlementType.Mint;
        await mockContinuousFeeSettleOnly.settle.returns(settlementType, constants.AddressZero, feeAmount);

        const preFundOwnerSharesCall = await vaultProxy.balanceOf(fundOwner);
        const preSharesTotalSupplyCall = await vaultProxy.totalSupply();

        // Settle continuous fees with active fee
        const receipt = await callOnExtension({
          signer: randomUser,
          comptrollerProxy,
          extension: feeManager,
          actionId: FeeManagerActionId.InvokeContinuousHook,
        });

        // Assert correct FeeSettledForFund emission for mockContinuousFeeSettleOnly
        const feeSettledForFundEvent = feeManager.abi.getEvent('FeeSettledForFund');
        assertEvent(receipt, feeSettledForFundEvent, {
          comptrollerProxy: comptrollerProxy,
          fee: mockContinuousFeeSettleOnly,
          settlementType,
          payer: constants.AddressZero,
          payee: fundOwner,
          sharesDue: feeAmount,
        });

        const postFundOwnerSharesCall = await vaultProxy.balanceOf(fundOwner);
        const postSharesTotalSupplyCall = await vaultProxy.totalSupply();

        // The feeAmount should be allocated to the fund owner
        expect(postFundOwnerSharesCall).toEqBigNumber(preFundOwnerSharesCall.add(feeAmount));

        // The shares totalSupply should be inflated by the feeAmount
        expect(postSharesTotalSupplyCall).toEqBigNumber(preSharesTotalSupplyCall.add(feeAmount));
      });
    });

    describe('SettlementType.MintSharesOutstanding', () => {
      it('mints shares to the VaultProxy, updates sharesOutstanding storage, and emits the correct event', async () => {
        const {
          accounts: [randomUser, buyer],
          deployment: { feeManager },
          fees: { mockContinuousFeeSettleOnly },
          fundOwner,
          denominationAsset,
          createFund,
        } = await provider.snapshot(snapshot);

        const investmentAmount = utils.parseEther('1');
        await denominationAsset.transfer(buyer, investmentAmount);

        const { vaultProxy, comptrollerProxy } = await createFund();

        // Seed fund with initial fund shares,
        // to give a non-zero totalSupply (so that minting new shares is allowed)
        await buyShares({
          comptrollerProxy,
          signer: buyer,
          buyers: [buyer],
          denominationAsset,
          investmentAmounts: [investmentAmount],
        });

        // Define fee settlement
        const feeAmount = utils.parseEther('0.5');
        const settlementType = FeeSettlementType.MintSharesOutstanding;
        await mockContinuousFeeSettleOnly.settle.returns(settlementType, constants.AddressZero, feeAmount);

        const preFundOwnerSharesCall = await vaultProxy.balanceOf(fundOwner);
        const preSharesTotalSupplyCall = await vaultProxy.totalSupply();
        const preVaultProxySharesCall = await vaultProxy.balanceOf(vaultProxy);
        const preSharesOutstanding = await feeManager.getFeeSharesOutstandingForFund(
          comptrollerProxy,
          mockContinuousFeeSettleOnly,
        );

        // Settle continuous fees with active fee
        const receipt = await callOnExtension({
          signer: randomUser,
          comptrollerProxy,
          extension: feeManager,
          actionId: FeeManagerActionId.InvokeContinuousHook,
        });

        // Assert correct FeeSettledForFund emission for mockContinuousFeeSettleOnly
        const feeSettledForFundEvent = feeManager.abi.getEvent('FeeSettledForFund');
        assertEvent(receipt, feeSettledForFundEvent, {
          comptrollerProxy: comptrollerProxy,
          fee: mockContinuousFeeSettleOnly,
          settlementType,
          payer: constants.AddressZero,
          payee: vaultProxy,
          sharesDue: feeAmount,
        });

        const postFundOwnerSharesCall = await vaultProxy.balanceOf(fundOwner);
        const postSharesTotalSupplyCall = await vaultProxy.totalSupply();
        const postVaultProxySharesCall = await vaultProxy.balanceOf(vaultProxy);
        const postSharesOutstanding = await feeManager.getFeeSharesOutstandingForFund(
          comptrollerProxy,
          mockContinuousFeeSettleOnly,
        );

        // The feeAmount should be allocated to the vaultProxy
        expect(postVaultProxySharesCall).toEqBigNumber(preVaultProxySharesCall.add(feeAmount));

        // The shares totalSupply should be inflated
        expect(postSharesTotalSupplyCall).toEqBigNumber(preSharesTotalSupplyCall.add(feeAmount));

        // The fund owner should not have an increase in shares
        expect(postFundOwnerSharesCall).toEqBigNumber(preFundOwnerSharesCall);

        // SharesOutstanding should have increased by feeAmount
        expect(postSharesOutstanding).toEqBigNumber(preSharesOutstanding.add(feeAmount));
      });
    });
  });

  describe('SettlementType.BurnSharesOutstanding', () => {
    it('mints and then burns shares from the VaultProxy, reduces sharesOutstanding storage, and emits correct event', async () => {
      const {
        accounts: [randomUser, buyer],
        deployment: { feeManager },
        fees: { mockContinuousFeeSettleOnly },
        fundOwner,
        denominationAsset,
        createFund,
      } = await provider.snapshot(snapshot);

      const investmentAmount = utils.parseEther('1');
      await denominationAsset.transfer(buyer, investmentAmount);

      const { vaultProxy, comptrollerProxy } = await createFund();

      // Seed fund with initial fund shares,
      // to give a non-zero totalSupply (so that minting new shares is allowed)
      await buyShares({
        comptrollerProxy,
        signer: buyer,
        buyers: [buyer],
        denominationAsset,
        investmentAmounts: [investmentAmount],
      });

      const preFundOwnerSharesCall = await vaultProxy.balanceOf(fundOwner);
      const preSharesTotalSupplyCall = await vaultProxy.totalSupply();
      const preVaultProxySharesCall = await vaultProxy.balanceOf(vaultProxy);
      const preSharesOutstanding = await feeManager.getFeeSharesOutstandingForFund(
        comptrollerProxy,
        mockContinuousFeeSettleOnly,
      );

      // First mint shares outstanding
      const mintFeeAmount = utils.parseEther('1');
      await mockContinuousFeeSettleOnly.settle.returns(
        FeeSettlementType.MintSharesOutstanding,
        constants.AddressZero,
        mintFeeAmount,
      );

      await callOnExtension({
        signer: randomUser,
        comptrollerProxy,
        extension: feeManager,
        actionId: FeeManagerActionId.InvokeContinuousHook,
      });

      const postMintSharesOutstanding = await feeManager.getFeeSharesOutstandingForFund(
        comptrollerProxy,
        mockContinuousFeeSettleOnly,
      );

      expect(postMintSharesOutstanding).toEqBigNumber(preSharesOutstanding.add(mintFeeAmount));

      // Then burn shares outstanding
      const burnFeeAmount = utils.parseEther('0.5');
      const settlementType = FeeSettlementType.BurnSharesOutstanding;
      await mockContinuousFeeSettleOnly.settle.returns(settlementType, constants.AddressZero, burnFeeAmount);
      const receipt = await callOnExtension({
        signer: randomUser,
        comptrollerProxy,
        extension: feeManager,
        actionId: FeeManagerActionId.InvokeContinuousHook,
      });

      // Assert correct FeeSettledForFund emission for mockContinuousFeeSettleOnly
      const feeSettledForFundEvent = feeManager.abi.getEvent('FeeSettledForFund');
      assertEvent(receipt, feeSettledForFundEvent, {
        comptrollerProxy,
        fee: mockContinuousFeeSettleOnly,
        settlementType,
        payer: vaultProxy,
        payee: constants.AddressZero,
        sharesDue: burnFeeAmount,
      });

      const postFundOwnerSharesCall = await vaultProxy.balanceOf(fundOwner);
      const postSharesTotalSupplyCall = await vaultProxy.totalSupply();
      const postVaultProxySharesCall = await vaultProxy.balanceOf(vaultProxy);
      const postSharesOutstanding = await feeManager.getFeeSharesOutstandingForFund(
        comptrollerProxy,
        mockContinuousFeeSettleOnly,
      );

      const expectedRemainingSharesOutstanding = BigNumber.from(mintFeeAmount).sub(burnFeeAmount);

      // The remaining fee amount should be allocated to the vaultProxy
      expect(postVaultProxySharesCall).toEqBigNumber(preVaultProxySharesCall.add(expectedRemainingSharesOutstanding));

      // The shares totalSupply should be inflated (minted shares minus burned shares)
      expect(postSharesTotalSupplyCall).toEqBigNumber(preSharesTotalSupplyCall.add(expectedRemainingSharesOutstanding));

      // The fund owner should not have any new shares
      expect(postFundOwnerSharesCall).toEqBigNumber(preFundOwnerSharesCall);

      // SharesOutstanding should equal minted fees minus burned fees
      expect(postSharesOutstanding).toEqBigNumber(preSharesOutstanding.add(expectedRemainingSharesOutstanding));
    });
  });

  it('calls `settle` on fees that implement a particular hook (PreBuyShares), with the correct params', async () => {
    const {
      accounts: [buyer],
      fees: { mockContinuousFeeSettleOnly, mockContinuousFeeWithGavAndUpdates },
      denominationAsset,
      createFund,
    } = await provider.snapshot(snapshot);

    const investmentAmount = utils.parseEther('2');
    const gav = investmentAmount;
    await denominationAsset.transfer(buyer, investmentAmount);

    const { vaultProxy, comptrollerProxy } = await createFund();

    await buyShares({
      comptrollerProxy,
      signer: buyer,
      buyers: [buyer],
      denominationAsset,
      investmentAmounts: [investmentAmount],
    });

    // Assert called settle and payout on Continuous fees (called before BuyShares fee hook)
    const preBuySharesArgs = settlePreBuySharesArgs({
      buyer,
      investmentAmount,
      minSharesQuantity: investmentAmount,
    });

    // Actual gav is 0 at time of call, so both fees should be called with 0 gav
    expect(mockContinuousFeeSettleOnly.settle).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      vaultProxy,
      FeeHook.PreBuyShares,
      preBuySharesArgs,
      0,
    );
    expect(mockContinuousFeeWithGavAndUpdates.settle).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      vaultProxy,
      FeeHook.PreBuyShares,
      preBuySharesArgs,
      0,
    );

    // Assert update to have been called with the actual new gav, post-buyShares
    expect(mockContinuousFeeWithGavAndUpdates.update).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      vaultProxy,
      FeeHook.PostBuyShares,
      preBuySharesArgs,
      gav,
    );

    // Assert non-update fee was not called with update()
    expect(mockContinuousFeeSettleOnly.update).not.toHaveBeenCalledOnContract();
  });
});

describe('__InvokeContinuousHook', () => {
  it('correctly handles a Continuous FeeHook when called by a random user', async () => {
    const {
      denominationAsset,
      accounts: [randomUser, buyer],
      deployment: { feeManager },
      fees: { mockContinuousFeeSettleOnly, mockContinuousFeeWithGavAndUpdates },
      createFund,
    } = await provider.snapshot(snapshot);

    const investmentAmount = utils.parseEther('2');
    const gav = investmentAmount;
    await denominationAsset.transfer(buyer, investmentAmount);

    const { vaultProxy, comptrollerProxy } = await createFund();

    // Seed fund so it has a non-zero GAV
    await buyShares({
      comptrollerProxy,
      signer: buyer,
      buyers: [buyer],
      denominationAsset,
      investmentAmounts: [investmentAmount],
    });

    await callOnExtension({
      signer: randomUser,
      comptrollerProxy,
      extension: feeManager,
      actionId: FeeManagerActionId.InvokeContinuousHook,
    });

    // Assert called settle on mockContinuousFeeSettleOnly with gav as 0
    expect(mockContinuousFeeSettleOnly.settle).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      vaultProxy,
      FeeHook.Continuous,
      '0x',
      0,
    );

    // Assert called settle on mockContinuousFeeWithGavAndUpdates with actual gav
    expect(mockContinuousFeeWithGavAndUpdates.settle).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      vaultProxy,
      FeeHook.Continuous,
      '0x',
      gav,
    );

    // Assert called update on mockContinuousFeeWithGavAndUpdates only
    expect(mockContinuousFeeWithGavAndUpdates.update).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      vaultProxy,
      FeeHook.Continuous,
      '0x',
      gav,
    );
    expect(mockContinuousFeeSettleOnly.update).not.toHaveBeenCalledOnContract();
  });
});

describe('__payoutSharesOutstandingForFees', () => {
  it('pays out shares outstanding (if payable) and emits one event per payout', async () => {
    const {
      accounts: [buyer],
      deployment: { feeManager },
      fees: { mockContinuousFeeSettleOnly, mockContinuousFeeWithGavAndUpdates },
      fundOwner,
      denominationAsset,
      createFund,
    } = await provider.snapshot(snapshot);

    const investmentAmount = utils.parseEther('1');
    await denominationAsset.transfer(buyer, investmentAmount);

    const { vaultProxy, comptrollerProxy } = await createFund();

    // Seed fund with initial fund shares,
    // to give a non-zero totalSupply (so that minting new shares is allowed)
    await buyShares({
      comptrollerProxy,
      denominationAsset,
      signer: buyer,
      buyers: [buyer],
      investmentAmounts: [investmentAmount],
    });

    const preFundOwnerSharesCall = await vaultProxy.balanceOf(fundOwner);
    const preSharesOutstandingCall = await vaultProxy.balanceOf(vaultProxy);

    // Define both fees the same way, but with different fee amounts
    const feeAmount1 = utils.parseEther('0.5');
    const feeAmount2 = utils.parseEther('0.25');
    const settlementType = FeeSettlementType.MintSharesOutstanding;
    await mockContinuousFeeSettleOnly.settle.returns(settlementType, constants.AddressZero, feeAmount1);
    await mockContinuousFeeWithGavAndUpdates.settle.returns(settlementType, constants.AddressZero, feeAmount2);

    // Define param for all calls on extension
    const extension = feeManager;
    const fees = [mockContinuousFeeSettleOnly, mockContinuousFeeWithGavAndUpdates];

    // Settle once via callOnExtension to mint shares outstanding with no payout
    await callOnExtension({
      comptrollerProxy,
      extension,
      actionId: FeeManagerActionId.InvokeContinuousHook,
    });

    // Define params for payout shares outstanding calls
    const callArgs = payoutSharesOutstandingForFeesArgs(fees);
    const actionId = FeeManagerActionId.PayoutSharesOutstandingForFees;

    // Attempting to payout should not mint shares while `payout` returns false
    await callOnExtension({
      comptrollerProxy,
      extension,
      actionId,
      callArgs,
    });

    expect(await vaultProxy.balanceOf(fundOwner)).toEqBigNumber(preFundOwnerSharesCall);

    // Set payout() to return true on both fees
    await mockContinuousFeeSettleOnly.payout.returns(true);
    await mockContinuousFeeWithGavAndUpdates.payout.returns(true);

    // Payout fees
    const receipt = await callOnExtension({
      comptrollerProxy,
      extension,
      actionId,
      callArgs,
    });

    const postFundOwnerSharesCall = await vaultProxy.balanceOf(fundOwner);
    const postSharesOutstandingCall = await vaultProxy.balanceOf(vaultProxy);

    // One event should have been emitted for each fee
    const events = extractEvent(receipt, feeManager.abi.getEvent('SharesOutstandingPaidForFund'));
    expect(events.length).toBe(2);
    expect(events[0]).toMatchEventArgs({
      comptrollerProxy,
      fee: mockContinuousFeeSettleOnly,
      sharesDue: feeAmount1,
    });
    expect(events[1]).toMatchEventArgs({
      comptrollerProxy,
      fee: mockContinuousFeeWithGavAndUpdates,
      sharesDue: feeAmount2,
    });

    // Both fees should be paid out to the fund owner
    const expectedSharesOutstandingPaid = feeAmount1.add(feeAmount2);
    expect(postFundOwnerSharesCall).toEqBigNumber(preFundOwnerSharesCall.add(expectedSharesOutstandingPaid));

    // There should be no change in shares in the VaultProxy
    expect(postSharesOutstandingCall).toEqBigNumber(preSharesOutstandingCall);
  });
});

describe('fee registry', () => {
  describe('deregisterFees', () => {
    it('can only be called by the owner of the FundDeployer contract', async () => {
      const {
        accounts: [, randomUser],
        deployment: { feeManager },
        fees: { mockContinuousFeeSettleOnly },
      } = await provider.snapshot(snapshot);

      // Attempt to call deregisterFees with a random (non-owner) account
      const deregisterFeesCall = feeManager.connect(randomUser).deregisterFees([mockContinuousFeeSettleOnly]);
      await expect(deregisterFeesCall).rejects.toBeRevertedWith('Only the FundDeployer owner can call this function');
    });

    it('does not allow empty _fees param', async () => {
      const {
        deployment: { feeManager },
      } = await provider.snapshot(snapshot);

      // Attempt to call deregisterFees with an empty _fees param
      const deregisterFeesCall = feeManager.deregisterFees([]);
      await expect(deregisterFeesCall).rejects.toBeRevertedWith('_fees cannot be empty');
    });

    it('does not allow an unregistered fee', async () => {
      const {
        deployment: { feeManager },
        fees: { mockContinuousFeeSettleOnly },
      } = await provider.snapshot(snapshot);

      // De-register mockContinuousFeeSettleOnly
      await feeManager.deregisterFees([mockContinuousFeeSettleOnly]);

      // Confirm that mockContinuousFeeSettleOnly is deregistered
      const isMockContinuousFeeSettleOnlyRegistered = await feeManager.isRegisteredFee(mockContinuousFeeSettleOnly);
      expect(isMockContinuousFeeSettleOnlyRegistered).toBe(false);

      // Attempt to de-register mockContinuousFeeSettleOnly again
      const deregisterFeesCall = feeManager.deregisterFees([mockContinuousFeeSettleOnly]);
      await expect(deregisterFeesCall).rejects.toBeRevertedWith('fee is not registered');
    });

    it('successfully de-registers multiple fees and fires one event per fee', async () => {
      const {
        deployment: { feeManager },
        fees: { mockContinuousFeeSettleOnly, mockContinuousFeeWithGavAndUpdates, mockPostBuySharesFee },
      } = await provider.snapshot(snapshot);

      // De-register multiple fees
      const fees = [mockContinuousFeeSettleOnly, mockContinuousFeeWithGavAndUpdates, mockPostBuySharesFee];
      const receipt = await feeManager.deregisterFees(fees);

      const feeDeregisteredEvent = feeManager.abi.getEvent('FeeDeregistered');

      // One feeDeregisteredEvent should have been emitted for each element in feeArray
      const events = extractEvent(receipt, feeDeregisteredEvent);
      expect(events.length).toBe(fees.length);

      // Make sure that each event contains the corresponding fee address
      expect(events[0]).toMatchEventArgs({
        fee: fees[0],
        identifier: expect.objectContaining({
          hash: utils.id('MOCK_CONTINUOUS_1'),
        }),
      });

      expect(events[1]).toMatchEventArgs({
        fee: fees[1],
        identifier: expect.objectContaining({
          hash: utils.id('MOCK_CONTINUOUS_2'),
        }),
      });

      expect(events[2]).toMatchEventArgs({
        fee: fees[2],
        identifier: expect.objectContaining({
          hash: utils.id('MOCK_POST_BUY_SHARES'),
        }),
      });
    });
  });

  describe('registerFees', () => {
    it('can only be called by the owner of the FundDeployer contract', async () => {
      const {
        accounts: [randomAccount],
        deployer,
        deployment: { feeManager },
      } = await provider.snapshot(snapshot);

      const mockFee = await IFee.mock(deployer);

      // Attempt to register the fee with a non-owner account
      const registerFeesCall = feeManager.connect(randomAccount).registerFees([mockFee]);
      await expect(registerFeesCall).rejects.toBeRevertedWith('Only the FundDeployer owner can call this function');
    });

    it('does not allow empty _fees param', async () => {
      const {
        deployment: { feeManager },
      } = await provider.snapshot(snapshot);

      // Attempt to register the fees with a non-owner account
      const registerFeesCall = feeManager.registerFees([]);
      await expect(registerFeesCall).rejects.toBeRevertedWith('_fees cannot be empty');
    });

    it('does not allow an already registered fee', async () => {
      const {
        fees: { mockContinuousFeeSettleOnly },
        deployment: { feeManager },
      } = await provider.snapshot(snapshot);

      // Confirm that mockContinuousFeeSettleOnly is already registered
      const ismockContinuousFeeSettleOnlyRegistered = await feeManager.isRegisteredFee(mockContinuousFeeSettleOnly);
      expect(ismockContinuousFeeSettleOnlyRegistered).toBe(true);

      // Attempt to re-register mockContinuousFeeSettleOnly
      const registerFeesCall = feeManager.registerFees([mockContinuousFeeSettleOnly]);
      await expect(registerFeesCall).rejects.toBeRevertedWith('fee already registered');
    });

    it('successfully registers multiple fees (stores registered fee and implemented fee hooks) and fires one event per fee', async () => {
      const {
        deployer,
        deployment: { feeManager },
      } = await provider.snapshot(snapshot);

      // Setup a mock fee that implements multiple hooks
      const identifier = `MOCK_FEE`;
      const settleHooks = [FeeHook.PreBuyShares, FeeHook.PreRedeemShares];
      const notIncludedSettleHooks = [FeeHook.PostBuyShares, FeeHook.Continuous];
      const updateHooks = [FeeHook.PreRedeemShares];
      const notIncludedUpdateHooks = [FeeHook.PreBuyShares, FeeHook.PostBuyShares, FeeHook.Continuous];
      const usesGavOnSettle = false;
      const usesGavOnUpdate = true;
      const mockFee = await IFee.mock(deployer);
      await mockFee.identifier.returns(identifier);
      await mockFee.implementedHooks.returns(settleHooks, updateHooks, usesGavOnSettle, usesGavOnUpdate);

      // Register the fees
      const receipt = await feeManager.registerFees([mockFee]);

      // Assert event
      assertEvent(receipt, 'FeeRegistered', {
        fee: mockFee.address,
        identifier: expect.objectContaining({
          hash: utils.id(identifier),
        }),
        implementedHooksForSettle: settleHooks,
        implementedHooksForUpdate: updateHooks,
        usesGavOnSettle,
        usesGavOnUpdate,
      });

      // Fees should be registered
      const getRegisteredFeesCall = await feeManager.getRegisteredFees();
      expect(getRegisteredFeesCall).toEqual(expect.arrayContaining([mockFee.address]));

      // Fee hooks should be stored
      for (const hook of settleHooks) {
        const goodFeeSettlesOnHookHookCall = await feeManager.feeSettlesOnHook(mockFee, hook);
        expect(goodFeeSettlesOnHookHookCall).toBe(true);
      }

      for (const hook of notIncludedSettleHooks) {
        const badFeeSettlesOnHookHookCall = await feeManager.feeSettlesOnHook(mockFee, hook);
        expect(badFeeSettlesOnHookHookCall).toBe(false);
      }

      for (const hook of updateHooks) {
        const goodFeeUpdatesOnHookHookCall = await feeManager.feeUpdatesOnHook(mockFee, hook);
        expect(goodFeeUpdatesOnHookHookCall).toBe(true);
      }

      for (const hook of notIncludedUpdateHooks) {
        const badFeeUpdatesOnHookHookCall = await feeManager.feeUpdatesOnHook(mockFee, hook);
        expect(badFeeUpdatesOnHookHookCall).toBe(false);
      }

      // Gav usage should be stored
      const feeUsesGavOnSettleCall = await feeManager.feeUsesGavOnSettle(mockFee);
      expect(feeUsesGavOnSettleCall).toBe(usesGavOnSettle);

      const feeUsesGavOnUpdateCall = await feeManager.feeUsesGavOnUpdate(mockFee);
      expect(feeUsesGavOnUpdateCall).toBe(usesGavOnUpdate);
    });
  });
});
