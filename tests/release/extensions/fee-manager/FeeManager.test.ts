import { extractEvent, randomAddress } from '@enzymefinance/ethers';
import {
  FeeHook,
  FeeManagerActionId,
  feeManagerConfigArgs,
  FeeSettlementType,
  IFee,
  IMigrationHookHandler,
  MockVaultLib,
  payoutSharesOutstandingForFeesArgs,
  settlePreBuySharesArgs,
  settlePostBuySharesArgs,
  WETH,
} from '@enzymefinance/protocol';
import {
  assertEvent,
  assertNoEvent,
  buyShares,
  callOnExtension,
  createNewFund,
  deployProtocolFixture,
  generateMockFees,
  getAssetUnit,
} from '@enzymefinance/testutils';
import { BigNumber, constants, utils } from 'ethers';

async function snapshot() {
  const {
    accounts: [fundOwner, ...remainingAccounts],
    deployment,
    config,
    deployer,
  } = await deployProtocolFixture();

  const fees = await generateMockFees({
    deployer,
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
      deployment: { feeManager, fundDeployer },
    } = await provider.snapshot(snapshot);

    const fundDeployerOwner = await fundDeployer.getOwner();
    const getOwnerCall = await feeManager.getOwner();
    expect(getOwnerCall).toMatchAddress(fundDeployerOwner);
  });
});

describe('activateForFund', () => {
  it('happy path', async () => {
    const { fees, createFund } = await provider.snapshot(snapshot);

    const { vaultProxy, comptrollerProxy } = await createFund();

    // Calls each enabled fee to activate
    for (const fee of Object.values(fees)) {
      expect(fee.activateForFund).toHaveBeenCalledOnContractWith(comptrollerProxy, vaultProxy);
    }
  });
});

describe('deactivateForFund', () => {
  it('pays out all shares outstanding', async () => {
    const {
      accounts: [buyer],
      deployer,
      deployment: { dispatcher, feeManager },
      fees: { mockContinuousFeeSettleOnly },
      fundOwner,
      denominationAsset,
      createFund,
    } = await provider.snapshot(snapshot);

    const { vaultProxy, comptrollerProxy } = await createFund();

    // Seed fund with initial fund shares,
    // to give a non-zero totalSupply (so that minting new shares is allowed)
    await buyShares({
      comptrollerProxy,
      buyer,
      denominationAsset,
      seedBuyer: true,
    });

    // Mint shares for a fee that are held as shares outstanding
    const feeAmount = utils.parseEther('0.5');
    await mockContinuousFeeSettleOnly.settle.returns(
      FeeSettlementType.MintSharesOutstanding,
      constants.AddressZero,
      feeAmount,
    );
    await callOnExtension({
      signer: fundOwner,
      comptrollerProxy,
      extension: feeManager,
      actionId: FeeManagerActionId.InvokeContinuousHook,
    });
    expect(
      await feeManager.getFeeSharesOutstandingForFund(comptrollerProxy, mockContinuousFeeSettleOnly),
    ).toEqBigNumber(feeAmount);

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

    // Migrate the vault
    const receipt = await mockNextFundDeployer.forward(dispatcher.executeMigration, vaultProxy, false);

    // Proper events are fired
    assertEvent(receipt, feeManager.abi.getEvent('SharesOutstandingPaidForFund'), {
      comptrollerProxy: comptrollerProxy,
      fee: mockContinuousFeeSettleOnly,
      payee: fundOwner,
      sharesDue: feeAmount,
    });

    const postFundOwnerSharesCall = await vaultProxy.balanceOf(fundOwner);
    const postSharesOutstandingCall = await vaultProxy.balanceOf(vaultProxy);

    // Fees should be settled and payout of shares outstanding forced
    const expectedPayoutAmount = BigNumber.from(feeAmount);
    expect(postFundOwnerSharesCall).toEqBigNumber(preFundOwnerSharesCall.add(expectedPayoutAmount));
    expect(postSharesOutstandingCall).toEqBigNumber(0);
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

    const { comptrollerProxy } = await createFund();

    // Buy shares of the fund so that fees accrue
    await buyShares({
      comptrollerProxy,
      buyer: fundInvestor,
      denominationAsset,
      seedBuyer: true,
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
  it('does not allow a random caller', async () => {
    const {
      accounts: [randomUser],
      deployment: { feeManager },
    } = await provider.snapshot(snapshot);

    await expect(
      feeManager.connect(randomUser).setConfigForFund(constants.AddressZero, constants.AddressZero, '0x'),
    ).rejects.toBeRevertedWith('Only the FundDeployer can make this call');
  });

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

  it('happy path', async () => {
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

    const { comptrollerProxy, receipt, vaultProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer,
      denominationAsset,
      feeManagerConfig,
    });

    // Assert state for fund
    expect(await feeManager.getVaultProxyForFund(comptrollerProxy)).toMatchAddress(vaultProxy);
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

    const nonActivatedMockFee = await IFee.mock(deployer);

    await Promise.all([
      nonActivatedMockFee.settle.returns(FeeSettlementType.None, constants.AddressZero, 0),
      nonActivatedMockFee.payout.returns(false),
      nonActivatedMockFee.addFundSettings.returns(undefined),
      nonActivatedMockFee.activateForFund.returns(undefined),
      nonActivatedMockFee.settlesOnHook.returns(false, false),
      nonActivatedMockFee.settlesOnHook.given(FeeHook.Continuous).returns(true, false),
      nonActivatedMockFee.settlesOnHook.given(FeeHook.PreBuyShares).returns(true, false),
      nonActivatedMockFee.settlesOnHook.given(FeeHook.PreRedeemShares).returns(true, false),
      nonActivatedMockFee.updatesOnHook.returns(false, false),
    ]);

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

    const { comptrollerProxy } = await createFund();

    // Buy shares
    await buyShares({
      comptrollerProxy,
      buyer,
      denominationAsset,
      seedBuyer: true,
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

        const { vaultProxy, comptrollerProxy } = await createFund();

        // Buying shares
        await buyShares({
          comptrollerProxy,
          buyer,
          denominationAsset,
          seedBuyer: true,
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

        const { vaultProxy, comptrollerProxy } = await createFund();

        // Define fee settlement
        const feeAmount = utils.parseEther('0.5');
        const settlementType = FeeSettlementType.Direct;
        await mockPostBuySharesFee.settle.returns(settlementType, buyer, feeAmount);

        const preFundOwnerSharesCall = await vaultProxy.balanceOf(fundOwner);
        const preBuyerSharesCall = await vaultProxy.balanceOf(buyer);

        // Buy shares with active fee
        const investmentAmount = await getAssetUnit(denominationAsset);
        const receipt = await buyShares({
          comptrollerProxy,
          buyer,
          denominationAsset,
          seedBuyer: true,
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

        const { vaultProxy, comptrollerProxy } = await createFund();

        // Define fee settlement
        const feeAmount = utils.parseEther('0.5');
        const settlementType = FeeSettlementType.Burn;
        await mockPostBuySharesFee.settle.returns(settlementType, buyer, feeAmount);

        const preFundOwnerSharesCall = await vaultProxy.balanceOf(fundOwner);
        const preBuyerSharesCall = await vaultProxy.balanceOf(buyer);
        const preSharesSupplyCall = await vaultProxy.totalSupply();

        // Buy shares with active fee
        const investmentAmount = await getAssetUnit(denominationAsset);
        const expectedSharesReceived = utils.parseEther('1').sub(feeAmount);
        const receipt = await buyShares({
          comptrollerProxy,
          buyer,
          denominationAsset,
          investmentAmount,
          seedBuyer: true,
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

        const { vaultProxy, comptrollerProxy } = await createFund();

        // Seed fund with initial fund shares,
        // to give a non-zero totalSupply (so that minting new shares is allowed)
        await buyShares({
          comptrollerProxy,
          buyer,
          denominationAsset,
          seedBuyer: true,
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

        const { vaultProxy, comptrollerProxy } = await createFund();

        // Seed fund with initial fund shares,
        // to give a non-zero totalSupply (so that minting new shares is allowed)
        await buyShares({
          comptrollerProxy,
          buyer,
          denominationAsset,
          seedBuyer: true,
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

      const { vaultProxy, comptrollerProxy } = await createFund();

      // Seed fund with initial fund shares,
      // to give a non-zero totalSupply (so that minting new shares is allowed)
      await buyShares({
        comptrollerProxy,
        buyer,
        denominationAsset,
        seedBuyer: true,
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

    const { vaultProxy, comptrollerProxy } = await createFund();

    await buyShares({
      comptrollerProxy,
      buyer,
      denominationAsset,
      investmentAmount,
      seedBuyer: true,
    });

    // Assert called settle and payout on Continuous fees (called before BuyShares fee hook)
    const preBuySharesArgs = settlePreBuySharesArgs({
      buyer,
      investmentAmount,
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
    const postBuySharesArgs = settlePostBuySharesArgs({
      buyer,
      investmentAmount,
      sharesBought: await vaultProxy.balanceOf(buyer),
    });

    expect(mockContinuousFeeWithGavAndUpdates.update).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      vaultProxy,
      FeeHook.PostBuyShares,
      postBuySharesArgs,
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

    const { vaultProxy, comptrollerProxy } = await createFund();

    // Seed fund so it has a non-zero GAV
    await buyShares({
      comptrollerProxy,
      buyer,
      denominationAsset,
      investmentAmount,
      seedBuyer: true,
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
  it('pays out shares outstanding (if payable) and emits one event per payout (multiple fee recipients)', async () => {
    const {
      accounts: [buyer],
      deployment: { feeManager },
      fees: { mockContinuousFeeSettleOnly: fee1, mockContinuousFeeWithGavAndUpdates: fee2 },
      fundOwner,
      denominationAsset,
      createFund,
    } = await provider.snapshot(snapshot);

    const { vaultProxy, comptrollerProxy } = await createFund();

    // Seed fund with initial fund shares,
    // to give a non-zero totalSupply (so that minting new shares is allowed)
    await buyShares({
      comptrollerProxy,
      buyer,
      denominationAsset,
      seedBuyer: true,
    });

    // Define both fees with the same settlement, but with different fee amounts and recipients
    const settlementType = FeeSettlementType.MintSharesOutstanding;

    const fee1Recipient = fundOwner; // Unspecified
    const fee1Amount = utils.parseEther('0.5');
    await fee1.settle.returns(settlementType, constants.AddressZero, fee1Amount);

    const fee2Recipient = randomAddress();
    await fee2.getRecipientForFund.given(comptrollerProxy).returns(fee2Recipient);
    const fee2Amount = utils.parseEther('0.25');
    await fee2.settle.returns(settlementType, constants.AddressZero, fee2Amount);

    // Define param for all calls on extension
    const extension = feeManager;
    const fees = [fee1, fee2];

    // Record prior shares balances
    const preTxFee1RecipientBalance = await vaultProxy.balanceOf(fee1Recipient);
    const preTxFee2RecipientBalance = await vaultProxy.balanceOf(fee2Recipient);

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
    expect(await vaultProxy.balanceOf(fee1Recipient)).toEqBigNumber(preTxFee1RecipientBalance);
    expect(await vaultProxy.balanceOf(fee2Recipient)).toEqBigNumber(preTxFee2RecipientBalance);

    // Set payout() to return true on both fees
    await fee1.payout.returns(true);
    await fee2.payout.returns(true);

    // Payout fees
    const receipt = await callOnExtension({
      comptrollerProxy,
      extension,
      actionId,
      callArgs,
    });

    // Record prior shares balances
    const postTxFee1RecipientBalance = await vaultProxy.balanceOf(fee1Recipient);
    const postTxFee2RecipientBalance = await vaultProxy.balanceOf(fee2Recipient);

    // One event should have been emitted for each fee
    const events = extractEvent(receipt, feeManager.abi.getEvent('SharesOutstandingPaidForFund'));
    expect(events.length).toBe(2);
    expect(events[0]).toMatchEventArgs({
      comptrollerProxy,
      fee: fee1,
      payee: fee1Recipient,
      sharesDue: fee1Amount,
    });
    expect(events[1]).toMatchEventArgs({
      comptrollerProxy,
      fee: fee2,
      payee: fee2Recipient,
      sharesDue: fee2Amount,
    });

    // Both fees should be paid out to the respective recipients
    expect(postTxFee1RecipientBalance).toEqBigNumber(preTxFee1RecipientBalance.add(fee1Amount));
    expect(postTxFee2RecipientBalance).toEqBigNumber(preTxFee2RecipientBalance.add(fee2Amount));
  });
});
