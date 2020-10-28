import { BigNumber, constants, utils } from 'ethers';
import {
  EthereumTestnetProvider,
  extractEvent,
  randomAddress,
  resolveAddress,
} from '@crestproject/crestproject';
import {
  IMigrationHookHandler,
  MockVaultLib,
  IFee,
} from '@melonproject/protocol';
import {
  assertEvent,
  defaultTestDeployment,
  buyShares,
  callOnExtension,
  createNewFund,
  encodeArgs,
  feeManagerActionIds,
  feeSettlementTypes,
  generateRegisteredMockFees,
  settlePreBuySharesArgs,
  settlePostBuySharesArgs,
  feeHooks,
} from '@melonproject/testutils';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(
    provider,
  );

  const fees = await generateRegisteredMockFees({
    deployer: config.deployer,
    feeManager: deployment.feeManager,
  });

  const feesSettingsData = [
    utils.randomBytes(10),
    utils.randomBytes(2),
    constants.HashZero,
  ];
  const feeManagerConfig = await encodeArgs(
    ['address[]', 'bytes[]'],
    [Object.values(fees), feesSettingsData],
  );
  const [fundOwner, ...remainingAccounts] = accounts;
  const denominationAsset = deployment.tokens.weth;

  const { comptrollerProxy, newFundTx, vaultProxy } = await createNewFund({
    signer: fundOwner,
    fundOwner,
    fundDeployer: deployment.fundDeployer,
    denominationAsset,
    feeManagerConfig,
  });

  return {
    accounts: remainingAccounts,
    config,
    deployment,
    fees,
    fund: {
      comptrollerProxy,
      denominationAsset,
      fundOwner,
      newFundTx,
      vaultProxy,
    },
  };
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      deployment: {
        feeManager,
        fundDeployer,
        entranceRateFee,
        managementFee,
        performanceFee,
      },
      fees,
    } = await provider.snapshot(snapshot);

    const getRegisteredFeesCall = feeManager.getRegisteredFees();
    await expect(getRegisteredFeesCall).resolves.toMatchObject([
      entranceRateFee.address,
      managementFee.address,
      performanceFee.address,
      ...Object.values(fees).map((fee) => fee.address),
    ]);

    const getOwnerCall = feeManager.getOwner();
    await expect(getOwnerCall).resolves.toBe(await fundDeployer.getOwner());
  });
});

describe('setFundConfig', () => {
  it.todo('does not allow unequal fees and settingsData array lengths');

  it.todo('does not allow duplicate fees');

  it.todo('does not allow unregistered fees');

  it('successfully configures FeeManager state and fires events', async () => {
    const {
      accounts: { 0: fundOwner },
      deployment: {
        feeManager,
        fundDeployer,
        tokens: { weth },
      },
      fees: { mockContinuousFee1, mockContinuousFee2, mockPostBuySharesFee },
    } = await provider.snapshot(snapshot);

    const fees = [mockContinuousFee1, mockContinuousFee2, mockPostBuySharesFee];
    const feesSettingsData = [
      utils.randomBytes(10),
      utils.randomBytes(2),
      constants.HashZero,
    ];
    const feeManagerConfig = await encodeArgs(
      ['address[]', 'bytes[]'],
      [fees, feesSettingsData],
    );
    const { comptrollerProxy, newFundTx } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer,
      denominationAsset: weth,
      feeManagerConfig,
    });

    // Assert state for fund
    const getEnabledFeesForFundCall = feeManager.getEnabledFeesForFund(
      comptrollerProxy,
    );
    await expect(getEnabledFeesForFundCall).resolves.toMatchObject([
      fees[0].address,
      fees[1].address,
      fees[2].address,
    ]);

    // Assert addFundSettings was called on each fee with its settingsData
    for (let i = 0; i < fees.length; i++) {
      await expect(fees[i].addFundSettings.ref).toHaveBeenCalledOnContractWith(
        comptrollerProxy,
        feesSettingsData[i],
      );
    }

    // Assert FeeEnabledForFund events
    const feeEnabledForFundEvent = feeManager.abi.getEvent('FeeEnabledForFund');
    const events = extractEvent(await newFundTx, feeEnabledForFundEvent);
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

describe('activateForFund', () => {
  it('correctly handles activation', async () => {
    const {
      deployment: { feeManager },
      fees,
      fund: { comptrollerProxy, vaultProxy },
    } = await provider.snapshot(snapshot);

    // Stores the ComptrollerProxy-VaultProxy pairing
    const getVaultProxyForFundCall = feeManager.getVaultProxyForFund(
      comptrollerProxy,
    );
    await expect(getVaultProxyForFundCall).resolves.toBe(vaultProxy.address);

    // Calls each enabled fee to activate
    for (const fee of Object.values(fees)) {
      await expect(fee.activateForFund.ref).toHaveBeenCalledOnContractWith(
        comptrollerProxy,
        vaultProxy,
      );
    }
  });
});

// TODO: we could use mocks here to call this function directly if we want
describe('deactivateForFund', () => {
  it('settles Continuous fees, pays out all shares outstanding, and deletes all fund config', async () => {
    const {
      accounts: { 0: buyer },
      config: { deployer },
      deployment: { dispatcher, feeManager },
      fund: { comptrollerProxy, denominationAsset, fundOwner, vaultProxy },
      fees: { mockContinuousFee1, mockContinuousFee2 },
    } = await provider.snapshot(snapshot);

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
    await mockContinuousFee1.settle.returns(
      feeSettlementTypes.MintSharesOutstanding,
      constants.AddressZero,
      feeAmount,
    );

    // Fee 2 mints shares directly to manager
    await mockContinuousFee2.settle.returns(
      feeSettlementTypes.Mint,
      constants.AddressZero,
      feeAmount,
    );

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
    const migrateTx = mockNextFundDeployer.forward(
      dispatcher.executeMigration,
      vaultProxy,
      false,
    );
    await expect(migrateTx).resolves.toBeReceipt();

    const postFundOwnerSharesCall = await vaultProxy.balanceOf(fundOwner);
    const postSharesOutstandingCall = await vaultProxy.balanceOf(vaultProxy);

    // Fees should be settled and payout of shares outstanding forced
    const expectedPayoutAmount = BigNumber.from(feeAmount).mul(2);
    expect(postFundOwnerSharesCall).toEqBigNumber(
      preFundOwnerSharesCall.add(expectedPayoutAmount),
    );
    expect(postSharesOutstandingCall).toEqBigNumber(preSharesOutstandingCall);

    // Fund config should be deleted
    const enabledFeesCall = feeManager.getEnabledFeesForFund(comptrollerProxy);
    expect(enabledFeesCall).resolves.toMatchObject([]);

    const getVaultProxyForFundCall = feeManager.getVaultProxyForFund(
      comptrollerProxy,
    );
    await expect(getVaultProxyForFundCall).resolves.toBe(constants.AddressZero);

    // Proper events are fired
    const allSharesOutstandingForcePaidForFundEvent = feeManager.abi.getEvent(
      'AllSharesOutstandingForcePaidForFund',
    );
    await assertEvent(migrateTx, allSharesOutstandingForcePaidForFundEvent, {
      comptrollerProxy: comptrollerProxy.address,
      payee: await resolveAddress(fundOwner),
      sharesDue: feeAmount,
    });
  });
});

describe('state getters', () => {
  it.todo('determine tests');
});

describe('deregisterFees', () => {
  it.todo('can only be called by the owner of the FundDeployer contract');

  it.todo('does not allow empty _fees param');

  it.todo('does not allow an unregistered fee');

  it.todo(
    'successfully de-registers multiple fees and fires one event per fee',
  );
});

describe('registerFees', () => {
  it.todo('can only be called by the owner of the FundDeployer contract');

  it.todo('does not allow empty _fees param');

  it.todo('does not allow an already registered fee');

  it('correctly handles a valid call (multiple implemented hooks)', async () => {
    const {
      config: { deployer },
      deployment: { feeManager },
    } = await provider.snapshot(snapshot);

    // Setup a mock fee that implements multiple hooks
    const identifier = `MOCK_FEE`;
    const hooks = [feeHooks.PreBuyShares, feeHooks.PreRedeemShares];
    const notIncludedHooks = [feeHooks.PostBuyShares, feeHooks.Continuous];
    const mockFee = await IFee.mock(deployer);
    await mockFee.identifier.returns(identifier);
    await mockFee.implementedHooks.returns(hooks);

    // Register the fees
    const registerFeesTx = feeManager.registerFees([mockFee]);
    await expect(registerFeesTx).resolves.toBeReceipt();

    // Fees should be registered
    const getRegisteredFeesCall = feeManager.getRegisteredFees();
    await expect(getRegisteredFeesCall).resolves.toEqual(
      expect.arrayContaining([mockFee.address]),
    );

    // Fee hooks should be stored
    for (const hook of hooks) {
      const goodFeeImplementsHookCall = feeManager.feeImplementsHook(
        mockFee,
        hook,
      );
      await expect(goodFeeImplementsHookCall).resolves.toBe(true);
    }
    for (const hook of notIncludedHooks) {
      const badFeeImplementsHookCall = feeManager.feeImplementsHook(
        mockFee,
        hook,
      );
      await expect(badFeeImplementsHookCall).resolves.toBe(false);
    }

    // Assert event
    const events = extractEvent(await registerFeesTx, 'FeeRegistered');
    expect(events.length).toBe(1);
    expect(events[0].args).toMatchObject({
      0: mockFee.address,
      1: expect.objectContaining({
        hash: utils.id(identifier),
      }),
      2: hooks,
    });
  });
});

describe('settleFees', () => {
  it.todo(
    'finishes silently when no fees of the specified FeeHook are enabled',
  );

  it.todo('correctly handles a fee that returns a SettlementType of None');

  it.todo(
    'does not allow minting new shares (Mint or MintOutstanding) if totalSupply is 0',
  );

  it('pays out shares outstanding if they available to pay', async () => {
    const {
      accounts: { 0: buyer },
      deployment: { feeManager },
      fund: { comptrollerProxy, denominationAsset, fundOwner, vaultProxy },
      fees: { mockContinuousFee1 },
    } = await provider.snapshot(snapshot);

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
    const settlementType = feeSettlementTypes.MintSharesOutstanding;
    await mockContinuousFee1.settle.returns(
      settlementType,
      constants.AddressZero,
      feeAmount,
    );
    await callOnExtension({
      comptrollerProxy,
      extension: feeManager,
      actionId: feeManagerActionIds.SettleContinuousFees,
    });

    // Payout fees after 2nd fee settlement
    await mockContinuousFee1.payout.returns(true);
    const settleContinuousFeesTx = callOnExtension({
      comptrollerProxy,
      extension: feeManager,
      actionId: feeManagerActionIds.SettleContinuousFees,
    });
    await expect(settleContinuousFeesTx).resolves.toBeReceipt();

    const postFundOwnerSharesCall = await vaultProxy.balanceOf(fundOwner);
    const postSharesOutstandingCall = await vaultProxy.balanceOf(vaultProxy);

    // The feeAmount x 2 (two equal settlements) should be allocated to the fund owner
    const expectedPayoutAmount = BigNumber.from(feeAmount).mul(2);
    expect(postFundOwnerSharesCall).toEqBigNumber(
      preFundOwnerSharesCall.add(expectedPayoutAmount),
    );

    // There should be no change in shares in the VaultProxy
    expect(postSharesOutstandingCall).toEqBigNumber(preSharesOutstandingCall);

    // Assert correct SharesOutstandingPaidForFund emission for mockContinuousFee1
    const feeSettledForFundEvent = feeManager.abi.getEvent(
      'SharesOutstandingPaidForFund',
    );
    await assertEvent(settleContinuousFeesTx, feeSettledForFundEvent, {
      comptrollerProxy: comptrollerProxy.address,
      fee: mockContinuousFee1.address,
      payee: await resolveAddress(fundOwner),
      sharesDue: expectedPayoutAmount,
    });
  });

  it('correctly handles a PreBuyShares FeeHook', async () => {
    const {
      accounts: { 0: buyer },
      fees: { mockContinuousFee1, mockContinuousFee2 },
      fund: { comptrollerProxy, denominationAsset, vaultProxy },
    } = await provider.snapshot(snapshot);

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
    });
    await expect(mockContinuousFee1.settle.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      vaultProxy,
      feeHooks.PreBuyShares,
      preBuySharesArgs,
    );
    await expect(mockContinuousFee1.payout.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      vaultProxy,
    );
    await expect(mockContinuousFee2.settle.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      vaultProxy,
      feeHooks.PreBuyShares,
      preBuySharesArgs,
    );
    await expect(mockContinuousFee2.payout.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      vaultProxy,
    );
  });

  it('correctly handles a PostBuyShares FeeHook', async () => {
    const {
      accounts: { 0: buyer },
      fees: { mockPostBuySharesFee },
      fund: { comptrollerProxy, denominationAsset, vaultProxy },
    } = await provider.snapshot(snapshot);

    const investmentAmount = utils.parseEther('2');
    await buyShares({
      comptrollerProxy,
      signer: buyer,
      buyer,
      denominationAsset,
      investmentAmount,
    });

    // Assert called settle and payout on BuyShares fees
    await expect(
      mockPostBuySharesFee.settle.ref,
    ).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      vaultProxy,
      feeHooks.PostBuyShares,
      settlePostBuySharesArgs({
        buyer,
        investmentAmount,
        sharesBought: investmentAmount,
      }),
    );
    await expect(
      mockPostBuySharesFee.payout.ref,
    ).toHaveBeenCalledOnContractWith(comptrollerProxy, vaultProxy);
  });

  it('correctly settles a direct fee payment (BuyShares fee hook)', async () => {
    const {
      accounts: { 0: buyer },
      deployment: { feeManager },
      fund: { comptrollerProxy, denominationAsset, fundOwner, vaultProxy },
      fees: { mockPostBuySharesFee },
    } = await provider.snapshot(snapshot);

    // Define fee settlement
    const investmentAmount = utils.parseEther('2');
    const feeAmount = utils.parseEther('0.5');
    const settlementType = feeSettlementTypes.Direct;
    await mockPostBuySharesFee.settle.returns(settlementType, buyer, feeAmount);

    const preFundOwnerSharesCall = await vaultProxy.balanceOf(fundOwner);
    const preBuyerSharesCall = await vaultProxy.balanceOf(buyer);

    // Buy shares with active fee
    const buySharesTx = await buyShares({
      comptrollerProxy,
      signer: buyer,
      buyer,
      denominationAsset,
      investmentAmount,
      minSharesAmount: BigNumber.from(investmentAmount).sub(feeAmount),
    });

    const postFundOwnerSharesCall = await vaultProxy.balanceOf(fundOwner);
    const postBuyerSharesCall = await vaultProxy.balanceOf(buyer);

    // The feeAmount should be allocated to the fund owner
    expect(postFundOwnerSharesCall).toEqBigNumber(
      preFundOwnerSharesCall.add(feeAmount),
    );

    // The feeAmount should be deducted from the buyer's shares
    expect(postBuyerSharesCall).toEqBigNumber(
      preBuyerSharesCall.add(investmentAmount).sub(feeAmount),
    );

    // Assert correct FeeSettledForFund emission for mockPostBuySharesFee
    const feeSettledForFundEvent = feeManager.abi.getEvent('FeeSettledForFund');
    await assertEvent(buySharesTx, feeSettledForFundEvent, {
      comptrollerProxy: comptrollerProxy.address,
      fee: mockPostBuySharesFee.address,
      settlementType,
      payer: await resolveAddress(buyer),
      payee: await resolveAddress(fundOwner),
      sharesDue: feeAmount,
    });
  });

  it('correctly settles an inflationary fee paid immediately (settleContinuousFees)', async () => {
    const {
      accounts: { 0: randomUser, 1: buyer },
      deployment: { feeManager },
      fund: { comptrollerProxy, denominationAsset, fundOwner, vaultProxy },
      fees: { mockContinuousFee1 },
    } = await provider.snapshot(snapshot);

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
    const settlementType = feeSettlementTypes.Mint;
    await mockContinuousFee1.settle.returns(
      settlementType,
      constants.AddressZero,
      feeAmount,
    );

    const preFundOwnerSharesCall = await vaultProxy.balanceOf(fundOwner);
    const preSharesTotalSupplyCall = await vaultProxy.totalSupply();

    // Settle continuous fees with active fee
    const settleContinuousFeesTx = await callOnExtension({
      signer: randomUser,
      comptrollerProxy,
      extension: feeManager,
      actionId: feeManagerActionIds.SettleContinuousFees,
    });

    const postFundOwnerSharesCall = await vaultProxy.balanceOf(fundOwner);
    const postSharesTotalSupplyCall = await vaultProxy.totalSupply();

    // The feeAmount should be allocated to the fund owner
    expect(postFundOwnerSharesCall).toEqBigNumber(
      preFundOwnerSharesCall.add(feeAmount),
    );

    // The shares totalSupply should be inflated by the feeAmount
    expect(postSharesTotalSupplyCall).toEqBigNumber(
      preSharesTotalSupplyCall.add(feeAmount),
    );

    // Assert correct FeeSettledForFund emission for mockContinuousFee1
    const feeSettledForFundEvent = feeManager.abi.getEvent('FeeSettledForFund');
    await assertEvent(settleContinuousFeesTx, feeSettledForFundEvent, {
      comptrollerProxy: comptrollerProxy.address,
      fee: mockContinuousFee1.address,
      settlementType,
      payer: constants.AddressZero,
      payee: await resolveAddress(fundOwner),
      sharesDue: feeAmount,
    });
  });

  it('correctly mints shares outstanding and fires an event (settleContinuousFees)', async () => {
    const {
      accounts: { 0: randomUser, 1: buyer },
      deployment: { feeManager },
      fund: { comptrollerProxy, denominationAsset, fundOwner, vaultProxy },
      fees: { mockContinuousFee1 },
    } = await provider.snapshot(snapshot);

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
    const settlementType = feeSettlementTypes.MintSharesOutstanding;
    await mockContinuousFee1.settle.returns(
      settlementType,
      constants.AddressZero,
      feeAmount,
    );

    const preFundOwnerSharesCall = await vaultProxy.balanceOf(fundOwner);
    const preSharesTotalSupplyCall = await vaultProxy.totalSupply();
    const preVaultProxySharesCall = await vaultProxy.balanceOf(vaultProxy);

    // Settle continuous fees with active fee
    const settleContinuousFeesTx = await callOnExtension({
      signer: randomUser,
      comptrollerProxy,
      extension: feeManager,
      actionId: feeManagerActionIds.SettleContinuousFees,
    });

    const postFundOwnerSharesCall = await vaultProxy.balanceOf(fundOwner);
    const postSharesTotalSupplyCall = await vaultProxy.totalSupply();
    const postVaultProxySharesCall = await vaultProxy.balanceOf(vaultProxy);

    // The feeAmount should be allocated to the vaultProxy
    expect(postVaultProxySharesCall).toEqBigNumber(
      preVaultProxySharesCall.add(feeAmount),
    );

    // The shares totalSupply should be inflated
    expect(postSharesTotalSupplyCall).toEqBigNumber(
      preSharesTotalSupplyCall.add(feeAmount),
    );

    // The fund owner should not have an increase in shares
    expect(postFundOwnerSharesCall).toEqBigNumber(preFundOwnerSharesCall);

    // Assert correct FeeSettledForFund emission for mockContinuousFee1
    const feeSettledForFundEvent = feeManager.abi.getEvent('FeeSettledForFund');
    await assertEvent(settleContinuousFeesTx, feeSettledForFundEvent, {
      comptrollerProxy: comptrollerProxy.address,
      fee: mockContinuousFee1.address,
      settlementType,
      payer: constants.AddressZero,
      payee: vaultProxy.address,
      sharesDue: feeAmount,
    });
  });

  it('correctly burns shares outstanding and fires an event', async () => {
    const {
      accounts: { 0: randomUser, 1: buyer },
      deployment: { feeManager },
      fund: { comptrollerProxy, denominationAsset, fundOwner, vaultProxy },
      fees: { mockContinuousFee1 },
    } = await provider.snapshot(snapshot);

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
      feeSettlementTypes.MintSharesOutstanding,
      constants.AddressZero,
      mintFeeAmount,
    );
    await callOnExtension({
      signer: randomUser,
      comptrollerProxy,
      extension: feeManager,
      actionId: feeManagerActionIds.SettleContinuousFees,
    });

    // Then burn shares outstanding
    const burnFeeAmount = utils.parseEther('0.5');
    const settlementType = feeSettlementTypes.BurnSharesOutstanding;
    await mockContinuousFee1.settle.returns(
      settlementType,
      constants.AddressZero,
      burnFeeAmount,
    );
    const settleContinuousFeesTx = await callOnExtension({
      signer: randomUser,
      comptrollerProxy,
      extension: feeManager,
      actionId: feeManagerActionIds.SettleContinuousFees,
    });

    const postFundOwnerSharesCall = await vaultProxy.balanceOf(fundOwner);
    const postSharesTotalSupplyCall = await vaultProxy.totalSupply();
    const postVaultProxySharesCall = await vaultProxy.balanceOf(vaultProxy);

    const expectedRemainingSharesOutstanding = BigNumber.from(
      mintFeeAmount,
    ).sub(burnFeeAmount);

    // The remaining fee amount should be allocated to the vaultProxy
    expect(postVaultProxySharesCall).toEqBigNumber(
      preVaultProxySharesCall.add(expectedRemainingSharesOutstanding),
    );

    // The shares totalSupply should be inflated (minted shares minus burned shares)
    expect(postSharesTotalSupplyCall).toEqBigNumber(
      preSharesTotalSupplyCall.add(expectedRemainingSharesOutstanding),
    );

    // The fund owner should not have any new shares
    expect(postFundOwnerSharesCall).toEqBigNumber(preFundOwnerSharesCall);

    // Assert correct FeeSettledForFund emission for mockContinuousFee1
    const feeSettledForFundEvent = feeManager.abi.getEvent('FeeSettledForFund');
    await assertEvent(settleContinuousFeesTx, feeSettledForFundEvent, {
      comptrollerProxy: comptrollerProxy.address,
      fee: mockContinuousFee1.address,
      settlementType,
      payer: vaultProxy.address,
      payee: constants.AddressZero,
      sharesDue: burnFeeAmount,
    });
  });

  it('correctly handles request to burn more shares outstanding than available', async () => {
    const {
      accounts: { 0: randomUser, 1: buyer },
      deployment: { feeManager },
      fund: { comptrollerProxy, denominationAsset, vaultProxy },
      fees: { mockContinuousFee1 },
    } = await provider.snapshot(snapshot);

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
      feeSettlementTypes.MintSharesOutstanding,
      constants.AddressZero,
      initialSharesOutstandingBal,
    );
    await callOnExtension({
      signer: randomUser,
      comptrollerProxy,
      extension: feeManager,
      actionId: feeManagerActionIds.SettleContinuousFees,
    });

    // Then attempt to burn more shares outstanding than available
    const feeAmount = utils.parseEther('1.5');
    const settlementType = feeSettlementTypes.BurnSharesOutstanding;
    await mockContinuousFee1.settle.returns(
      settlementType,
      constants.AddressZero,
      feeAmount,
    );

    await callOnExtension({
      signer: randomUser,
      comptrollerProxy,
      extension: feeManager,
      actionId: feeManagerActionIds.SettleContinuousFees,
    });

    const postSharesTotalSupplyCall = await vaultProxy.totalSupply();
    const postVaultProxySharesCall = await vaultProxy.balanceOf(vaultProxy);

    // The VaultProxy should have its original balance of shares
    expect(postVaultProxySharesCall).toEqBigNumber(preVaultProxySharesCall);

    // The shares totalSupply should be the original amount
    expect(postSharesTotalSupplyCall).toEqBigNumber(preSharesTotalSupplyCall);
  });
});

describe('settleContinuousFees', () => {
  it('correctly handles a Continuous FeeHook when called by a random user', async () => {
    const {
      accounts: { 0: randomUser },
      deployment: { feeManager },
      fees: { mockContinuousFee1, mockContinuousFee2, mockPostBuySharesFee },
      fund: { comptrollerProxy, vaultProxy },
    } = await provider.snapshot(snapshot);

    const settleContinuousFeesTx = callOnExtension({
      signer: randomUser,
      comptrollerProxy,
      extension: feeManager,
      actionId: feeManagerActionIds.SettleContinuousFees,
    });
    await expect(settleContinuousFeesTx).resolves.toBeReceipt();

    // Assert called settle and payout on Continuous fees
    await expect(mockContinuousFee1.settle.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      vaultProxy,
      feeHooks.Continuous,
      '0x',
    );
    await expect(mockContinuousFee1.payout.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      vaultProxy,
    );
    await expect(mockContinuousFee2.settle.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      vaultProxy,
      feeHooks.Continuous,
      '0x',
    );
    await expect(mockContinuousFee2.payout.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      vaultProxy,
    );

    // Assert BuyShares fees not called
    expect(mockPostBuySharesFee.settle.ref).not.toHaveBeenCalledOnContract();
    expect(mockPostBuySharesFee.payout.ref).not.toHaveBeenCalledOnContract();
  });
});

it.todo('test with 2 fees that have shares outstanding balances');

it.todo('add shares outstanding balance checks to settlement tests');
