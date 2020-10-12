import {
  EthereumTestnetProvider,
  extractEvent,
  randomAddress,
  resolveAddress,
} from '@crestproject/crestproject';
import {
  IMigrationHookHandler,
  MockVaultLib,
} from '@melonproject/persistent/utils/contracts';
import { assertEvent } from '@melonproject/utils';
import { BigNumber, constants, utils } from 'ethers';
import { defaultTestDeployment } from '../../../';
import {
  buyShares,
  callOnExtension,
  createNewFund,
  encodeArgs,
  feeSettlementTypes,
  generateRegisteredMockFees,
  settleBuySharesArgs,
  settleContinuousFeesSelector,
} from '../../utils';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(
    provider,
  );

  return {
    accounts,
    deployment,
    config,
  };
}

async function snapshotWithMocks(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await provider.snapshot(snapshot);

  const fees = await generateRegisteredMockFees({
    deployer: config.deployer,
    feeManager: deployment.feeManager,
  });

  return {
    accounts,
    deployment,
    config,
    fees,
  };
}

async function snapshotWithMocksAndFund(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config, fees } = await provider.snapshot(
    snapshotWithMocks,
  );

  const feesSettingsData = [utils.randomBytes(10), utils.randomBytes(2), '0x'];
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
    } = await provider.snapshot(snapshot);

    const getRegisteredFeesCall = feeManager.getRegisteredFees();
    await expect(getRegisteredFeesCall).resolves.toMatchObject([
      entranceRateFee.address,
      managementFee.address,
      performanceFee.address,
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
      fees: { mockContinuousFee1, mockContinuousFee2, mockBuySharesFee },
    } = await provider.snapshot(snapshotWithMocks);

    const fees = [mockContinuousFee1, mockContinuousFee2, mockBuySharesFee];
    const feesSettingsData = [
      utils.randomBytes(10),
      utils.randomBytes(2),
      '0x',
    ];
    const feeManagerConfig = await encodeArgs(
      ['address[]', 'bytes[]'],
      [fees, feesSettingsData],
    );
    const { comptrollerProxy, newFundTx, vaultProxy } = await createNewFund({
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
    const getFeesRecipientForFundCall = feeManager.getFeesRecipientForFund(
      comptrollerProxy,
    );
    await expect(getFeesRecipientForFundCall).resolves.toBe(
      await vaultProxy.getOwner(),
    );

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
      fund: { comptrollerProxy, fundOwner },
    } = await provider.snapshot(snapshotWithMocksAndFund);

    // Sets the fee recipient as the fund owner
    const getFeesRecipientForFundCall = feeManager.getFeesRecipientForFund(
      comptrollerProxy,
    );
    await expect(getFeesRecipientForFundCall).resolves.toBe(
      await resolveAddress(fundOwner),
    );

    // Calls each enabled fee to activate
    for (const fee of Object.values(fees)) {
      await expect(fee.activateForFund.ref).toHaveBeenCalledOnContractWith(
        comptrollerProxy,
      );
    }
  });
});

// TODO: we could use mocks here to call this function directly if we want
describe('deactivateForFund', () => {
  it('settles Continuous fees, pays out all shares outstanding, and deletes all fund config', async () => {
    const {
      config: { deployer },
      deployment: { dispatcher, feeManager },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
      fees: { mockContinuousFee1, mockContinuousFee2 },
    } = await provider.snapshot(snapshotWithMocksAndFund);

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

    // Migrate the vault
    const migrateTx = mockNextFundDeployer.forward(
      dispatcher.executeMigration,
      vaultProxy,
      false,
    );
    await expect(migrateTx).resolves.toBeReceipt();

    // Fees should be settled and payout of shares outstanding forced
    const expectedPayoutAmount = BigNumber.from(feeAmount).mul(2);

    const fundOwnerSharesCall = await vaultProxy.balanceOf(fundOwner);
    expect(fundOwnerSharesCall).toEqBigNumber(expectedPayoutAmount);

    const sharesOutstandingCall = await vaultProxy.balanceOf(vaultProxy);
    expect(sharesOutstandingCall).toEqBigNumber(0);

    // Fund config should be deleted
    const enabledFeesCall = feeManager.getEnabledFeesForFund(comptrollerProxy);
    expect(enabledFeesCall).resolves.toMatchObject([]);

    const feesRecipientCall = feeManager.getFeesRecipientForFund(
      comptrollerProxy,
    );
    expect(feesRecipientCall).resolves.toBe(constants.AddressZero);

    // Proper events are fired
    const allSharesOutstandingForcePaidEvent = feeManager.abi.getEvent(
      'AllSharesOutstandingForcePaid',
    );
    await assertEvent(migrateTx, allSharesOutstandingForcePaidEvent, {
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

  it.todo('successfully registers multiple fees and fires one event per fee');
});

describe('settleFees', () => {
  it.todo(
    'finishes silently when no fees of the specified FeeHook are enabled',
  );

  it('pays out shares outstanding if they available to pay', async () => {
    const {
      deployment: { feeManager },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
      fees: { mockContinuousFee1 },
    } = await provider.snapshot(snapshotWithMocksAndFund);

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
      selector: settleContinuousFeesSelector,
    });

    // Payout fees after 2nd fee settlement
    await mockContinuousFee1.payout.returns(true);
    const settleContinuousFeesTx = callOnExtension({
      comptrollerProxy,
      extension: feeManager,
      selector: settleContinuousFeesSelector,
    });
    await expect(settleContinuousFeesTx).resolves.toBeReceipt();

    const fundOwnerSharesCall = await vaultProxy.balanceOf(fundOwner);
    const sharesOutstandingCall = await vaultProxy.balanceOf(vaultProxy);

    const expectedPayoutAmount = BigNumber.from(feeAmount).mul(2);

    // The feeAmount x 2 (two equal settlements) should be allocated to the fund owner
    expect(fundOwnerSharesCall).toEqBigNumber(expectedPayoutAmount);
    // No shares should remain in the VaultProxy
    expect(sharesOutstandingCall).toEqBigNumber(0);

    // Assert correct SharesOutstandingPaidForFee emission for mockContinuousFee1
    const feeSettledForFundEvent = feeManager.abi.getEvent(
      'SharesOutstandingPaidForFee',
    );
    await assertEvent(settleContinuousFeesTx, feeSettledForFundEvent, {
      comptrollerProxy: comptrollerProxy.address,
      fee: mockContinuousFee1.address,
      payee: await resolveAddress(fundOwner),
      sharesDue: expectedPayoutAmount,
    });
  });

  it('correctly handles a BuyShares FeeHook', async () => {
    const {
      accounts: { 0: buyer },
      fees: { mockContinuousFee1, mockContinuousFee2, mockBuySharesFee },
      fund: { comptrollerProxy, denominationAsset },
    } = await provider.snapshot(snapshotWithMocksAndFund);

    const investmentAmount = utils.parseEther('2');
    await buyShares({
      comptrollerProxy,
      signer: buyer,
      buyer,
      denominationAsset,
      investmentAmount,
    });

    // Assert called settle and payout on Continuous fees (called before BuyShares fee hook)
    await expect(mockContinuousFee1.settle.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      '0x',
    );
    await expect(mockContinuousFee1.payout.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
    );
    await expect(mockContinuousFee2.settle.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      '0x',
    );
    await expect(mockContinuousFee2.payout.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
    );
    // Assert called settle and payout on BuyShares fees
    await expect(mockBuySharesFee.settle.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      settleBuySharesArgs({
        buyer,
        investmentAmount,
        sharesBought: investmentAmount,
      }),
    );
    await expect(mockBuySharesFee.payout.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
    );
  });

  it('correctly settles a direct fee payment (BuyShares fee hook)', async () => {
    const {
      accounts: { 0: buyer },
      deployment: { feeManager },
      fund: { comptrollerProxy, denominationAsset, fundOwner, vaultProxy },
      fees: { mockBuySharesFee },
    } = await provider.snapshot(snapshotWithMocksAndFund);

    const investmentAmount = utils.parseEther('2');
    const feeAmount = utils.parseEther('0.5');
    const settlementType = feeSettlementTypes.Direct;
    await mockBuySharesFee.settle.returns(settlementType, buyer, feeAmount);

    const buySharesTx = await buyShares({
      comptrollerProxy,
      signer: buyer,
      buyer,
      denominationAsset,
      investmentAmount,
      minSharesAmount: BigNumber.from(investmentAmount).sub(feeAmount),
    });

    // The feeAmount should be deducted from the buyer's shares and allocated to the fund owner
    const fundOwnerSharesCall = await vaultProxy.balanceOf(fundOwner);
    expect(fundOwnerSharesCall).toEqBigNumber(feeAmount);

    const buyerSharesCall = await vaultProxy.balanceOf(buyer);
    expect(buyerSharesCall).toEqBigNumber(
      BigNumber.from(investmentAmount).sub(feeAmount),
    );

    // Assert correct FeeSettledForFund emission for mockBuySharesFee
    const feeSettledForFundEvent = feeManager.abi.getEvent('FeeSettledForFund');
    const events = extractEvent(buySharesTx, feeSettledForFundEvent);
    expect(events.length).toBe(3);
    let eventExists = false;
    for (const event of events) {
      if (event.args.fee == mockBuySharesFee.address) {
        expect(event.args).toMatchObject({
          comptrollerProxy: comptrollerProxy.address,
          settlementType,
          sharesDue: feeAmount,
        });
        eventExists = true;
      }
    }
    expect(eventExists).toBeTruthy();
  });

  it('correctly settles an inflationary fee paid immediately (settleContinuousFees)', async () => {
    const {
      accounts: { 0: randomUser },
      deployment: { feeManager },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
      fees: { mockContinuousFee1 },
    } = await provider.snapshot(snapshotWithMocksAndFund);

    const feeAmount = utils.parseEther('0.5');
    const settlementType = feeSettlementTypes.Mint;
    await mockContinuousFee1.settle.returns(
      settlementType,
      constants.AddressZero,
      feeAmount,
    );

    const settleContinuousFeesTx = await callOnExtension({
      signer: randomUser,
      comptrollerProxy,
      extension: feeManager,
      selector: settleContinuousFeesSelector,
    });

    // The feeAmount should be allocated to the fund owner
    const fundOwnerSharesCall = await vaultProxy.balanceOf(fundOwner);
    expect(fundOwnerSharesCall).toEqBigNumber(feeAmount);

    // The shares totalSupply should be inflated
    const sharesTotalSupplyCall = await vaultProxy.totalSupply();
    expect(sharesTotalSupplyCall).toEqBigNumber(feeAmount);

    // Assert correct FeeSettledForFund emission for mockContinuousFee1
    const feeSettledForFundEvent = feeManager.abi.getEvent('FeeSettledForFund');
    const events = extractEvent(settleContinuousFeesTx, feeSettledForFundEvent);
    expect(events.length).toBe(2);
    let eventExists = false;
    for (const event of events) {
      if (event.args.fee == mockContinuousFee1.address) {
        expect(event.args).toMatchObject({
          comptrollerProxy: comptrollerProxy.address,
          settlementType,
          sharesDue: feeAmount,
        });
        eventExists = true;
      }
    }
    expect(eventExists).toBeTruthy();
  });

  it('correctly mints shares outstanding and fires an event (settleContinuousFees)', async () => {
    const {
      accounts: { 0: randomUser },
      deployment: { feeManager },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
      fees: { mockContinuousFee1 },
    } = await provider.snapshot(snapshotWithMocksAndFund);

    const feeAmount = utils.parseEther('0.5');
    const settlementType = feeSettlementTypes.MintSharesOutstanding;
    await mockContinuousFee1.settle.returns(
      settlementType,
      constants.AddressZero,
      feeAmount,
    );

    const settleContinuousFeesTx = await callOnExtension({
      signer: randomUser,
      comptrollerProxy,
      extension: feeManager,
      selector: settleContinuousFeesSelector,
    });

    // The feeAmount should be allocated to the vaultProxy
    const vaultProxySharesCall = await vaultProxy.balanceOf(vaultProxy);
    expect(vaultProxySharesCall).toEqBigNumber(feeAmount);
    // The shares totalSupply should be inflated
    const sharesTotalSupplyCall = await vaultProxy.totalSupply();
    expect(sharesTotalSupplyCall).toEqBigNumber(feeAmount);
    // The fund owner should not have an increase in shares
    const fundOwnerSharesCall = await vaultProxy.balanceOf(fundOwner);
    expect(fundOwnerSharesCall).toEqBigNumber(0);

    // Assert correct FeeSettledForFund emission for mockContinuousFee1
    const feeSettledForFundEvent = feeManager.abi.getEvent('FeeSettledForFund');
    const events = extractEvent(settleContinuousFeesTx, feeSettledForFundEvent);
    expect(events.length).toBe(2);
    let eventExists = false;
    for (const event of events) {
      if (event.args.fee == mockContinuousFee1.address) {
        expect(event.args).toMatchObject({
          comptrollerProxy: comptrollerProxy.address,
          settlementType,
          sharesDue: feeAmount,
        });
        eventExists = true;
      }
    }
    expect(eventExists).toBeTruthy();
  });

  it('correctly burns shares outstanding and fires an event', async () => {
    const {
      accounts: { 0: randomUser },
      deployment: { feeManager },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
      fees: { mockContinuousFee1 },
    } = await provider.snapshot(snapshotWithMocksAndFund);

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
      selector: settleContinuousFeesSelector,
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
      selector: settleContinuousFeesSelector,
    });

    const expectedRemainingSharesOutstanding = BigNumber.from(
      mintFeeAmount,
    ).sub(burnFeeAmount);

    // The remaining fee amount should be allocated to the vaultProxy
    const vaultProxySharesCall = await vaultProxy.balanceOf(vaultProxy);
    expect(vaultProxySharesCall).toEqBigNumber(
      expectedRemainingSharesOutstanding,
    );

    // The shares totalSupply should be inflated (minted shares minus burned shares)
    const sharesTotalSupplyCall = await vaultProxy.totalSupply();
    expect(sharesTotalSupplyCall).toEqBigNumber(
      expectedRemainingSharesOutstanding,
    );

    // The fund owner should not have any shares
    const fundOwnerSharesCall = await vaultProxy.balanceOf(fundOwner);
    expect(fundOwnerSharesCall).toEqBigNumber(0);

    // Assert correct FeeSettledForFund emission for mockContinuousFee1
    const feeSettledForFundEvent = feeManager.abi.getEvent('FeeSettledForFund');
    const events = extractEvent(settleContinuousFeesTx, feeSettledForFundEvent);
    expect(events.length).toBe(2);
    let eventExists = false;
    for (const event of events) {
      if (event.args.fee == mockContinuousFee1.address) {
        expect(event.args).toMatchObject({
          comptrollerProxy: comptrollerProxy.address,
          settlementType,
          sharesDue: burnFeeAmount,
        });
        eventExists = true;
      }
    }
    expect(eventExists).toBeTruthy();
  });

  it('correctly handles request to burn more shares outstanding than available', async () => {
    const {
      accounts: { 0: randomUser },
      deployment: { feeManager },
      fund: { comptrollerProxy, vaultProxy },
      fees: { mockContinuousFee1 },
    } = await provider.snapshot(snapshotWithMocksAndFund);

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
      selector: settleContinuousFeesSelector,
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
      selector: settleContinuousFeesSelector,
    });

    // The VaultProxy should have 0 shares
    const vaultProxySharesCall = vaultProxy.balanceOf(vaultProxy);
    await expect(vaultProxySharesCall).resolves.toEqBigNumber(0);
    // The shares totalSupply should be 0
    const sharesTotalSupplyCall = vaultProxy.totalSupply();
    await expect(sharesTotalSupplyCall).resolves.toEqBigNumber(0);
  });
});

describe('settleContinuousFees', () => {
  it('correctly handles a Continuous FeeHook when called by a random user', async () => {
    const {
      accounts: { 0: randomUser },
      deployment: { feeManager },
      fund: { comptrollerProxy },
      fees: { mockContinuousFee1, mockContinuousFee2, mockBuySharesFee },
    } = await provider.snapshot(snapshotWithMocksAndFund);

    const settleContinuousFeesTx = callOnExtension({
      signer: randomUser,
      comptrollerProxy,
      extension: feeManager,
      selector: settleContinuousFeesSelector,
    });
    await expect(settleContinuousFeesTx).resolves.toBeReceipt();

    // Assert called settle and payout on Continuous fees
    await expect(mockContinuousFee1.settle.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      '0x',
    );
    await expect(mockContinuousFee1.payout.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
    );
    await expect(mockContinuousFee2.settle.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
      '0x',
    );
    await expect(mockContinuousFee2.payout.ref).toHaveBeenCalledOnContractWith(
      comptrollerProxy,
    );

    // Assert BuyShares fees were not called
    await expect(mockBuySharesFee.settle.ref).not.toHaveBeenCalledOnContract();
    await expect(mockBuySharesFee.payout.ref).not.toHaveBeenCalledOnContract();
  });
});
