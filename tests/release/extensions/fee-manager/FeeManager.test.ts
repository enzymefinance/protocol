import { BigNumber, constants, utils } from 'ethers';
import { EthereumTestnetProvider, extractEvent, randomAddress } from '@crestproject/crestproject';
import {
  IMigrationHookHandler,
  MockVaultLib,
  IFee,
  settlePreBuySharesArgs,
  feeManagerConfigArgs,
  FeeSettlementType,
  FeeHook,
  FeeManagerActionId,
} from '@melonproject/protocol';
import {
  assertEvent,
  defaultTestDeployment,
  buyShares,
  callOnExtension,
  createNewFund,
  generateRegisteredMockFees,
} from '@melonproject/testutils';

async function snapshot(provider: EthereumTestnetProvider) {
  const {
    accounts: [fundOwner, ...remainingAccounts],
    deployment,
    config,
  } = await defaultTestDeployment(provider);

  const fees = await generateRegisteredMockFees({
    deployer: config.deployer,
    feeManager: deployment.feeManager,
  });

  const denominationAsset = deployment.tokens.weth;

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
    expect(getRegisteredFeesCall).toMatchFunctionOutput(feeManager.getRegisteredFees.fragment, [
      entranceRateBurnFee,
      entranceRateDirectFee,
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
  it('stores the validated VaultProxy and calls `activeateForFund()` on each Fee', async () => {
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
      config: { deployer },
      deployment: { dispatcher, feeManager },
      fees: { mockContinuousFee1, mockContinuousFee2 },
      fundOwner,
      denominationAsset,
      createFund,
    } = await provider.snapshot(snapshot);

    const { vaultProxy, comptrollerProxy } = await createFund();

    // Seed fund with initial fund shares,
    // to give a non-zero totalSupply (so that minting new shares is allowed)
    await buyShares({
      comptrollerProxy,
      signer: buyer,
      buyer,
      denominationAsset,
    });

    // All fee settlement amounts are the same
    const feeAmount = utils.parseEther('0.5');

    // Fee 1 mints shares outstanding with no payout ever
    await mockContinuousFee1.settle.returns(FeeSettlementType.MintSharesOutstanding, constants.AddressZero, feeAmount);

    // Fee 2 mints shares directly to manager
    await mockContinuousFee2.settle.returns(FeeSettlementType.Mint, constants.AddressZero, feeAmount);

    // Setup a new mock release to migrate the fund
    const mockNextFundDeployer = await IMigrationHookHandler.mock(deployer);
    const mockNextVaultLib = await MockVaultLib.deploy(deployer);
    await dispatcher.setCurrentFundDeployer(mockNextFundDeployer);

    // Signal migration and warp to migratable time
    await mockNextFundDeployer.forward(
      dispatcher.signalMigration,
      vaultProxy,
      randomAddress(),
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
  it.todo('does not allow an invalid _actionId');

  // NOTE TO DEV: just check whether a mock fee that implements the Continuous fee hook is called
  it.todo('calls the correct action for actionId');
});

describe('setConfigForFund', () => {
  it.todo('does not allow unequal fees and settingsData array lengths');

  it.todo('does not allow duplicate fees');

  it.todo('does not allow an unregistered fee');

  it('calls `addFundSettings` on each Fee, adds all fees to storage, and fires the correct event per Fee', async () => {
    const {
      accounts: [fundOwner],
      deployment: {
        feeManager,
        fundDeployer,
        tokens: { weth },
      },
      fees: { mockContinuousFee1, mockContinuousFee2, mockPostBuySharesFee },
    } = await provider.snapshot(snapshot);

    const fees = [mockContinuousFee1, mockContinuousFee2, mockPostBuySharesFee];
    const feesSettingsData = [utils.randomBytes(10), utils.randomBytes(2), constants.HashZero];

    const feeManagerConfig = feeManagerConfigArgs({
      fees: fees,
      settings: feesSettingsData,
    });

    const { comptrollerProxy, receipt } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer,
      denominationAsset: weth,
      feeManagerConfig,
    });

    // Assert state for fund
    const getEnabledFeesForFundCall = await feeManager.getEnabledFeesForFund(comptrollerProxy);
    expect(getEnabledFeesForFundCall).toMatchFunctionOutput(feeManager.getEnabledFeesForFund.fragment, [
      fees[0],
      fees[1],
      fees[2],
    ]);

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

describe('settleFees', () => {
  it.todo('does not allow a non-activated fund');

  it.todo('finishes silently when no fees of the specified FeeHook are implemented');

  describe('SettlementTypes', () => {
    describe('SettlementType.None', () => {
      it.todo('does not change shares totalSupply or fund manager balance, and does not emit event');
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
        const investmentAmount = utils.parseEther('2');
        const feeAmount = utils.parseEther('0.5');
        const settlementType = FeeSettlementType.Direct;
        await mockPostBuySharesFee.settle.returns(settlementType, buyer, feeAmount);

        const preFundOwnerSharesCall = await vaultProxy.balanceOf(fundOwner);
        const preBuyerSharesCall = await vaultProxy.balanceOf(buyer);

        // Buy shares with active fee
        const receipt = await buyShares({
          comptrollerProxy,
          signer: buyer,
          buyer,
          denominationAsset,
          investmentAmount,
          minSharesAmount: BigNumber.from(investmentAmount).sub(feeAmount),
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
        const investmentAmount = utils.parseEther('2');
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
          buyer,
          denominationAsset,
          investmentAmount,
          minSharesAmount: expectedSharesReceived,
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
      it.todo('does not allow minting if shares totalSupply is 0');

      it('mints new shares to the payee and emits the correct event', async () => {
        const {
          accounts: [randomUser, buyer],
          deployment: { feeManager },
          fees: { mockContinuousFee1 },
          fundOwner,
          denominationAsset,
          createFund,
        } = await provider.snapshot(snapshot);

        const { vaultProxy, comptrollerProxy } = await createFund();

        // Seed fund with initial fund shares,
        // to give a non-zero totalSupply (so that minting new shares is allowed)
        await buyShares({
          comptrollerProxy,
          signer: buyer,
          buyer,
          denominationAsset,
        });

        // Define fee settlement
        const feeAmount = utils.parseEther('0.5');
        const settlementType = FeeSettlementType.Mint;
        await mockContinuousFee1.settle.returns(settlementType, constants.AddressZero, feeAmount);

        const preFundOwnerSharesCall = await vaultProxy.balanceOf(fundOwner);
        const preSharesTotalSupplyCall = await vaultProxy.totalSupply();

        // Settle continuous fees with active fee
        const receipt = await callOnExtension({
          signer: randomUser,
          comptrollerProxy,
          extension: feeManager,
          actionId: FeeManagerActionId.SettleContinuousFees,
        });

        // Assert correct FeeSettledForFund emission for mockContinuousFee1
        const feeSettledForFundEvent = feeManager.abi.getEvent('FeeSettledForFund');
        assertEvent(receipt, feeSettledForFundEvent, {
          comptrollerProxy: comptrollerProxy,
          fee: mockContinuousFee1,
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
      it.todo('does not allow minting if shares totalSupply is 0');

      it('mints shares to the VaultProxy, updates sharesOutstanding storage, and emits the correct event', async () => {
        const {
          accounts: [randomUser, buyer],
          deployment: { feeManager },
          fees: { mockContinuousFee1 },
          fundOwner,
          denominationAsset,
          createFund,
        } = await provider.snapshot(snapshot);

        const { vaultProxy, comptrollerProxy } = await createFund();

        // Seed fund with initial fund shares,
        // to give a non-zero totalSupply (so that minting new shares is allowed)
        await buyShares({
          comptrollerProxy,
          signer: buyer,
          buyer,
          denominationAsset,
        });

        // Define fee settlement
        const feeAmount = utils.parseEther('0.5');
        const settlementType = FeeSettlementType.MintSharesOutstanding;
        await mockContinuousFee1.settle.returns(settlementType, constants.AddressZero, feeAmount);

        const preFundOwnerSharesCall = await vaultProxy.balanceOf(fundOwner);
        const preSharesTotalSupplyCall = await vaultProxy.totalSupply();
        const preVaultProxySharesCall = await vaultProxy.balanceOf(vaultProxy);

        // Settle continuous fees with active fee
        const receipt = await callOnExtension({
          signer: randomUser,
          comptrollerProxy,
          extension: feeManager,
          actionId: FeeManagerActionId.SettleContinuousFees,
        });

        // Assert correct FeeSettledForFund emission for mockContinuousFee1
        const feeSettledForFundEvent = feeManager.abi.getEvent('FeeSettledForFund');
        assertEvent(receipt, feeSettledForFundEvent, {
          comptrollerProxy: comptrollerProxy,
          fee: mockContinuousFee1,
          settlementType,
          payer: constants.AddressZero,
          payee: vaultProxy,
          sharesDue: feeAmount,
        });

        const postFundOwnerSharesCall = await vaultProxy.balanceOf(fundOwner);
        const postSharesTotalSupplyCall = await vaultProxy.totalSupply();
        const postVaultProxySharesCall = await vaultProxy.balanceOf(vaultProxy);

        // The feeAmount should be allocated to the vaultProxy
        expect(postVaultProxySharesCall).toEqBigNumber(preVaultProxySharesCall.add(feeAmount));

        // The shares totalSupply should be inflated
        expect(postSharesTotalSupplyCall).toEqBigNumber(preSharesTotalSupplyCall.add(feeAmount));

        // The fund owner should not have an increase in shares
        expect(postFundOwnerSharesCall).toEqBigNumber(preFundOwnerSharesCall);
      });

      it.todo('[implement `updates sharesOutstanding storage` in the above test]');
    });
  });

  describe('SettlementType.BurnSharesOutstanding', () => {
    it('burns shares from the VaultProxy, reduces sharesOutstanding storage, and emits correct event', async () => {
      const {
        accounts: [randomUser, buyer],
        deployment: { feeManager },
        fees: { mockContinuousFee1 },
        fundOwner,
        denominationAsset,
        createFund,
      } = await provider.snapshot(snapshot);

      const { vaultProxy, comptrollerProxy } = await createFund();

      // Seed fund with initial fund shares,
      // to give a non-zero totalSupply (so that minting new shares is allowed)
      await buyShares({
        comptrollerProxy,
        signer: buyer,
        buyer,
        denominationAsset,
      });

      const preFundOwnerSharesCall = await vaultProxy.balanceOf(fundOwner);
      const preSharesTotalSupplyCall = await vaultProxy.totalSupply();
      const preVaultProxySharesCall = await vaultProxy.balanceOf(vaultProxy);

      // First mint shares outstanding
      const mintFeeAmount = utils.parseEther('1');
      await mockContinuousFee1.settle.returns(
        FeeSettlementType.MintSharesOutstanding,
        constants.AddressZero,
        mintFeeAmount,
      );

      await callOnExtension({
        signer: randomUser,
        comptrollerProxy,
        extension: feeManager,
        actionId: FeeManagerActionId.SettleContinuousFees,
      });

      // Then burn shares outstanding
      const burnFeeAmount = utils.parseEther('0.5');
      const settlementType = FeeSettlementType.BurnSharesOutstanding;
      await mockContinuousFee1.settle.returns(settlementType, constants.AddressZero, burnFeeAmount);
      const receipt = await callOnExtension({
        signer: randomUser,
        comptrollerProxy,
        extension: feeManager,
        actionId: FeeManagerActionId.SettleContinuousFees,
      });

      // Assert correct FeeSettledForFund emission for mockContinuousFee1
      const feeSettledForFundEvent = feeManager.abi.getEvent('FeeSettledForFund');
      assertEvent(receipt, feeSettledForFundEvent, {
        comptrollerProxy,
        fee: mockContinuousFee1,
        settlementType,
        payer: vaultProxy,
        payee: constants.AddressZero,
        sharesDue: burnFeeAmount,
      });

      const postFundOwnerSharesCall = await vaultProxy.balanceOf(fundOwner);
      const postSharesTotalSupplyCall = await vaultProxy.totalSupply();
      const postVaultProxySharesCall = await vaultProxy.balanceOf(vaultProxy);

      const expectedRemainingSharesOutstanding = BigNumber.from(mintFeeAmount).sub(burnFeeAmount);

      // The remaining fee amount should be allocated to the vaultProxy
      expect(postVaultProxySharesCall).toEqBigNumber(preVaultProxySharesCall.add(expectedRemainingSharesOutstanding));

      // The shares totalSupply should be inflated (minted shares minus burned shares)
      expect(postSharesTotalSupplyCall).toEqBigNumber(preSharesTotalSupplyCall.add(expectedRemainingSharesOutstanding));

      // The fund owner should not have any new shares
      expect(postFundOwnerSharesCall).toEqBigNumber(preFundOwnerSharesCall);
    });

    it.todo('[implement `reduces sharesOutstanding storage` in the above test]');

    it('correctly handles attempt to burn more shares than available (by burning the total amount of shares outstanding)', async () => {
      const {
        accounts: [randomUser, buyer],
        deployment: { feeManager },
        fees: { mockContinuousFee1 },
        denominationAsset,
        createFund,
      } = await provider.snapshot(snapshot);

      const { vaultProxy, comptrollerProxy } = await createFund();

      // Seed fund with initial fund shares,
      // to give a non-zero totalSupply (so that minting new shares is allowed)
      await buyShares({
        comptrollerProxy,
        signer: buyer,
        buyer,
        denominationAsset,
      });

      const preSharesTotalSupplyCall = await vaultProxy.totalSupply();
      const preVaultProxySharesCall = await vaultProxy.balanceOf(vaultProxy);

      // First mint shares outstanding
      const initialSharesOutstandingBal = utils.parseEther('1');
      await mockContinuousFee1.settle.returns(
        FeeSettlementType.MintSharesOutstanding,
        constants.AddressZero,
        initialSharesOutstandingBal,
      );

      await callOnExtension({
        signer: randomUser,
        comptrollerProxy,
        extension: feeManager,
        actionId: FeeManagerActionId.SettleContinuousFees,
      });

      // Then attempt to burn more shares outstanding than available
      const feeAmount = utils.parseEther('1.5');
      const settlementType = FeeSettlementType.BurnSharesOutstanding;
      await mockContinuousFee1.settle.returns(settlementType, constants.AddressZero, feeAmount);

      await callOnExtension({
        signer: randomUser,
        comptrollerProxy,
        extension: feeManager,
        actionId: FeeManagerActionId.SettleContinuousFees,
      });

      const postSharesTotalSupplyCall = await vaultProxy.totalSupply();
      const postVaultProxySharesCall = await vaultProxy.balanceOf(vaultProxy);

      // The VaultProxy should have its original balance of shares
      expect(postVaultProxySharesCall).toEqBigNumber(preVaultProxySharesCall);

      // The shares totalSupply should be the original amount
      expect(postSharesTotalSupplyCall).toEqBigNumber(preSharesTotalSupplyCall);
    });

    it.todo(
      '[above test should test that only the total of sharesOutstanding for the particular fee is burned, not the other shares in the VaultProxy; send shares to the VaultProxy to test against the storage value]',
    );
  });

  describe('__payoutSharesOutstandingForFee', () => {
    it('pays out shares outstanding (if payable) and emits event', async () => {
      const {
        accounts: [buyer],
        deployment: { feeManager },
        fees: { mockContinuousFee1 },
        fundOwner,
        denominationAsset,
        createFund,
      } = await provider.snapshot(snapshot);

      const { vaultProxy, comptrollerProxy } = await createFund();

      // Seed fund with initial fund shares,
      // to give a non-zero totalSupply (so that minting new shares is allowed)
      await buyShares({
        comptrollerProxy,
        signer: buyer,
        buyer,
        denominationAsset,
      });

      const preFundOwnerSharesCall = await vaultProxy.balanceOf(fundOwner);
      const preSharesOutstandingCall = await vaultProxy.balanceOf(vaultProxy);

      // Mint shares outstanding with no payout
      const feeAmount = utils.parseEther('0.5');

      // The feeAmount x 2 (two equal settlements) should be allocated to the fund owner
      const expectedPayoutAmount = BigNumber.from(feeAmount).mul(2);

      const settlementType = FeeSettlementType.MintSharesOutstanding;
      await mockContinuousFee1.settle.returns(settlementType, constants.AddressZero, feeAmount);

      await callOnExtension({
        comptrollerProxy,
        extension: feeManager,
        actionId: FeeManagerActionId.SettleContinuousFees,
      });

      // Payout fees after 2nd fee settlement
      await mockContinuousFee1.payout.returns(true);
      const receipt = await callOnExtension({
        comptrollerProxy,
        extension: feeManager,
        actionId: FeeManagerActionId.SettleContinuousFees,
      });

      // Assert correct SharesOutstandingPaidForFund emission for mockContinuousFee1
      const feeSettledForFundEvent = feeManager.abi.getEvent('SharesOutstandingPaidForFund');

      assertEvent(receipt, feeSettledForFundEvent, {
        comptrollerProxy: comptrollerProxy,
        fee: mockContinuousFee1,
        payee: fundOwner,
        sharesDue: expectedPayoutAmount,
      });

      const postFundOwnerSharesCall = await vaultProxy.balanceOf(fundOwner);
      const postSharesOutstandingCall = await vaultProxy.balanceOf(vaultProxy);
      expect(postFundOwnerSharesCall).toEqBigNumber(preFundOwnerSharesCall.add(expectedPayoutAmount));

      // There should be no change in shares in the VaultProxy
      expect(postSharesOutstandingCall).toEqBigNumber(preSharesOutstandingCall);
    });
  });

  it('calls `settle` on fees that implement a particular hook (PreBuyShares), with the correct params', async () => {
    const {
      accounts: [buyer],
      fees: { mockContinuousFee1, mockContinuousFee2 },
      denominationAsset,
      createFund,
    } = await provider.snapshot(snapshot);

    const { vaultProxy, comptrollerProxy } = await createFund();

    const investmentAmount = utils.parseEther('2');
    await buyShares({
      comptrollerProxy,
      signer: buyer,
      buyer,
      denominationAsset,
      investmentAmount,
    });

    // Assert called settle and payout on Continuous fees (called before BuyShares fee hook)
    const preBuySharesArgs = settlePreBuySharesArgs({
      buyer,
      investmentAmount,
      minSharesQuantity: investmentAmount,
      fundGav: 0,
    });

    expect(mockContinuousFee1.settle).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      vaultProxy,
      FeeHook.PreBuyShares,
      preBuySharesArgs,
    );

    expect(mockContinuousFee1.payout).toHaveBeenCalledOnContractWith(comptrollerProxy, vaultProxy);

    expect(mockContinuousFee2.settle).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      vaultProxy,
      FeeHook.PreBuyShares,
      preBuySharesArgs,
    );

    expect(mockContinuousFee2.payout).toHaveBeenCalledOnContractWith(comptrollerProxy, vaultProxy);
  });
});

describe('__settleContinuousFees', () => {
  it('correctly handles a Continuous FeeHook when called by a random user', async () => {
    const {
      accounts: [randomUser],
      deployment: { feeManager },
      fees: { mockContinuousFee1, mockContinuousFee2, mockPostBuySharesFee },
      createFund,
    } = await provider.snapshot(snapshot);

    const { vaultProxy, comptrollerProxy } = await createFund();

    await callOnExtension({
      signer: randomUser,
      comptrollerProxy,
      extension: feeManager,
      actionId: FeeManagerActionId.SettleContinuousFees,
    });

    // Assert called settle and payout on Continuous fees
    expect(mockContinuousFee1.settle).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      vaultProxy,
      FeeHook.Continuous,
      '0x',
    );

    expect(mockContinuousFee1.payout).toHaveBeenCalledOnContractWith(comptrollerProxy, vaultProxy);

    expect(mockContinuousFee2.settle).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      vaultProxy,
      FeeHook.Continuous,
      '0x',
    );

    expect(mockContinuousFee2.payout).toHaveBeenCalledOnContractWith(comptrollerProxy, vaultProxy);

    // Assert BuyShares fees not called
    expect(mockPostBuySharesFee.settle).not.toHaveBeenCalledOnContract();
    expect(mockPostBuySharesFee.payout).not.toHaveBeenCalledOnContract();
  });
});

describe('fee registry', () => {
  describe('deregisterFees', () => {
    it.todo('can only be called by the owner of the FundDeployer contract');

    it.todo('does not allow empty _fees param');

    it.todo('does not allow an unregistered fee');

    it.todo('successfully de-registers multiple fees and fires one event per fee');
  });

  describe('registerFees', () => {
    it.todo('can only be called by the owner of the FundDeployer contract');

    it.todo('does not allow empty _fees param');

    it.todo('does not allow an already registered fee');

    it('successfully registers multiple fees (stores registered fee and implemented fee hooks) and fires one event per fee', async () => {
      const {
        config: { deployer },
        deployment: { feeManager },
      } = await provider.snapshot(snapshot);

      // Setup a mock fee that implements multiple hooks
      const identifier = `MOCK_FEE`;
      const hooks = [FeeHook.PreBuyShares, FeeHook.PreRedeemShares];
      const notIncludedHooks = [FeeHook.PostBuyShares, FeeHook.Continuous];
      const mockFee = await IFee.mock(deployer);
      await mockFee.identifier.returns(identifier);
      await mockFee.implementedHooks.returns(hooks);

      // Register the fees
      const receipt = await feeManager.registerFees([mockFee]);

      // Assert event
      assertEvent(receipt, 'FeeRegistered', {
        adapter: mockFee.address,
        identifier: expect.objectContaining({
          hash: utils.id(identifier),
        }),
        implementedHooks: hooks,
      });

      // Fees should be registered
      const getRegisteredFeesCall = await feeManager.getRegisteredFees();
      expect(getRegisteredFeesCall).toEqual(expect.arrayContaining([mockFee.address]));

      // Fee hooks should be stored
      for (const hook of hooks) {
        const goodFeeImplementsHookCall = await feeManager.feeImplementsHook(mockFee, hook);
        expect(goodFeeImplementsHookCall).toBe(true);
      }

      for (const hook of notIncludedHooks) {
        const badFeeImplementsHookCall = await feeManager.feeImplementsHook(mockFee, hook);
        expect(badFeeImplementsHookCall).toBe(false);
      }
    });
  });
});
