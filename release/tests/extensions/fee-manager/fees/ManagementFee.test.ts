import { BigNumber, constants, utils } from 'ethers';
import { EthereumTestnetProvider } from '@crestproject/crestproject';
import { assertEvent } from '@melonproject/utils';
import { defaultTestDeployment } from '../../../../';
import {
  ComptrollerLib,
  ManagementFee,
  VaultLib,
} from '../../../../utils/contracts';
import {
  feeHooks,
  feeSettlementTypes,
  managementFeeConfigArgs,
  managementFeeSharesDue,
} from '../../../utils';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(
    provider,
  );

  // Create standalone ManagementFee
  const [EOAFeeManager, ...remainingAccounts] = accounts;
  const standaloneManagementFee = await ManagementFee.deploy(
    config.deployer,
    EOAFeeManager,
  );

  // Mock a VaultProxy
  const mockVaultProxy = await VaultLib.mock(config.deployer);
  await mockVaultProxy.totalSupply.returns(0);

  // Mock a ComptrollerProxy
  const mockComptrollerProxy = await ComptrollerLib.mock(config.deployer);
  await mockComptrollerProxy.getVaultProxy.returns(mockVaultProxy.address);

  // Add fee settings for ComptrollerProxy
  const managementFeeRate = utils.parseEther('.1'); // 10%
  const managementFeeConfig = await managementFeeConfigArgs(managementFeeRate);
  await standaloneManagementFee
    .connect(EOAFeeManager)
    .addFundSettings(mockComptrollerProxy, managementFeeConfig);

  return {
    accounts: remainingAccounts,
    config,
    deployment,
    EOAFeeManager,
    managementFeeRate,
    mockComptrollerProxy,
    mockVaultProxy,
    standaloneManagementFee,
  };
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      deployment: { feeManager, managementFee },
    } = await provider.snapshot(snapshot);

    const getFeeManagerCall = managementFee.getFeeManager();
    await expect(getFeeManagerCall).resolves.toBe(feeManager.address);

    // Implements used hooks
    const settlesOnHookContinuousCall = managementFee.settlesOnHook(
      feeHooks.Continuous,
    );
    await expect(settlesOnHookContinuousCall).resolves.toBe(true);

    const settlesOnHookPreBuySharesCall = managementFee.settlesOnHook(
      feeHooks.PreBuyShares,
    );
    await expect(settlesOnHookPreBuySharesCall).resolves.toBe(true);

    const settlesOnHookPreRedeemSharesCall = managementFee.settlesOnHook(
      feeHooks.PreRedeemShares,
    );
    await expect(settlesOnHookPreRedeemSharesCall).resolves.toBe(true);

    // Does not implement unused hooks
    const settlesOnHookPostBuySharesCall = managementFee.settlesOnHook(
      feeHooks.PostBuyShares,
    );
    await expect(settlesOnHookPostBuySharesCall).resolves.toBe(false);
  });
});

describe('addFundSettings', () => {
  it('can only be called by the FeeManager', async () => {
    const {
      managementFeeRate,
      mockComptrollerProxy,
      standaloneManagementFee,
    } = await provider.snapshot(snapshot);

    const managementFeeConfig = await managementFeeConfigArgs(
      managementFeeRate,
    );
    const addFundSettingsTx = standaloneManagementFee.addFundSettings(
      mockComptrollerProxy,
      managementFeeConfig,
    );

    await expect(addFundSettingsTx).rejects.toBeRevertedWith(
      'Only the FeeManger can make this call',
    );
  });

  it('sets initial config values for fund and fires events', async () => {
    const {
      EOAFeeManager,
      managementFeeRate,
      mockComptrollerProxy,
      standaloneManagementFee,
    } = await provider.snapshot(snapshot);

    const managementFeeConfig = await managementFeeConfigArgs(
      managementFeeRate,
    );
    const addFundSettingsTx = standaloneManagementFee
      .connect(EOAFeeManager)
      .addFundSettings(mockComptrollerProxy, managementFeeConfig);
    await expect(addFundSettingsTx).resolves.toBeReceipt();

    // managementFeeRate should be set for comptrollerProxy
    const getFeeInfoForFundCall = standaloneManagementFee.getFeeInfoForFund(
      mockComptrollerProxy,
    );
    await expect(getFeeInfoForFundCall).resolves.toMatchObject({
      rate: managementFeeRate,
      lastSettled: BigNumber.from(0),
    });

    // Assert the FundSettingsAdded event was emitted
    await assertEvent(addFundSettingsTx, 'FundSettingsAdded', {
      comptrollerProxy: mockComptrollerProxy.address,
      rate: managementFeeRate,
    });
  });
});

describe('payout', () => {
  it('returns false', async () => {
    const {
      mockComptrollerProxy,
      standaloneManagementFee,
    } = await provider.snapshot(snapshot);

    const payoutCall = standaloneManagementFee.payout
      .args(mockComptrollerProxy)
      .call();
    await expect(payoutCall).resolves.toBe(false);
  });
});

describe('settle', () => {
  it('can only be called by the FeeManager', async () => {
    const {
      mockComptrollerProxy,
      standaloneManagementFee,
    } = await provider.snapshot(snapshot);

    const settleTx = standaloneManagementFee.settle(
      mockComptrollerProxy,
      feeHooks.Continuous,
      '0x',
    );

    await expect(settleTx).rejects.toBeRevertedWith(
      'Only the FeeManger can make this call',
    );
  });

  it('correctly handles shares supply of 0', async () => {
    const {
      EOAFeeManager,
      mockComptrollerProxy,
      managementFeeRate,
      standaloneManagementFee,
    } = await provider.snapshot(snapshot);

    // Check the return value via a call
    const settleCall = standaloneManagementFee
      .connect(EOAFeeManager)
      .settle.args(mockComptrollerProxy, feeHooks.Continuous, '0x')
      .call();
    await expect(settleCall).resolves.toMatchObject({
      0: feeSettlementTypes.None,
      1: constants.AddressZero,
      2: BigNumber.from(0),
    });

    // Send the tx to actually settle
    const settleTx = standaloneManagementFee
      .connect(EOAFeeManager)
      .settle(mockComptrollerProxy, feeHooks.Continuous, '0x');
    await expect(settleTx).resolves.toBeReceipt();
    const settlementTimestamp = (await provider.getBlock('latest')).timestamp;

    // Fee info should be updated with lastSettled, even though no shares were due
    const getFeeInfoForFundCall = standaloneManagementFee.getFeeInfoForFund(
      mockComptrollerProxy,
    );
    await expect(getFeeInfoForFundCall).resolves.toMatchObject({
      rate: managementFeeRate,
      lastSettled: BigNumber.from(settlementTimestamp),
    });

    // Settled event emitted
    await assertEvent(settleTx, 'Settled', {
      comptrollerProxy: mockComptrollerProxy.address,
      sharesQuantity: BigNumber.from(0),
      prevSettled: BigNumber.from(0),
    });
  });

  it('correctly handles shares supply >0', async () => {
    const {
      EOAFeeManager,
      mockComptrollerProxy,
      managementFeeRate,
      mockVaultProxy,
      standaloneManagementFee,
    } = await provider.snapshot(snapshot);

    // Settle while shares supply is 0 to set lastSettled
    await standaloneManagementFee
      .connect(EOAFeeManager)
      .settle(mockComptrollerProxy, feeHooks.Continuous, '0x');
    const settlementTimestamp1 = (await provider.getBlock('latest')).timestamp;

    // Update shares supply on mock
    const sharesSupply = utils.parseEther('1');
    await mockVaultProxy.totalSupply.returns(sharesSupply);

    // Mine a block after a time delay
    const secondsToWarp = 10;
    await provider.send('evm_increaseTime', [secondsToWarp]);
    await provider.send('evm_mine', []);

    // Get the expected shares due for a call() to settle()
    // The call() adds 1 second to the last block timestamp
    const expectedSharesDueForCall = managementFeeSharesDue({
      rate: managementFeeRate,
      sharesSupply,
      secondsSinceLastSettled: BigNumber.from(secondsToWarp).add(1),
    });

    // Check the return values via a call() to settle()
    const settleCall = standaloneManagementFee
      .connect(EOAFeeManager)
      .settle.args(mockComptrollerProxy, feeHooks.Continuous, '0x')
      .call();

    await expect(settleCall).resolves.toMatchObject({
      0: feeSettlementTypes.Mint,
      1: constants.AddressZero,
      2: expectedSharesDueForCall,
    });

    // Send the tx to actually settle()
    const settleTx = standaloneManagementFee
      .connect(EOAFeeManager)
      .settle(mockComptrollerProxy, feeHooks.Continuous, '0x');
    await expect(settleTx).resolves.toBeReceipt();
    const settlementTimestamp2 = (await provider.getBlock('latest')).timestamp;

    // Get the expected shares due for the actual settlement
    const expectedSharesDueForTx = managementFeeSharesDue({
      rate: managementFeeRate,
      sharesSupply,
      secondsSinceLastSettled: BigNumber.from(settlementTimestamp2).sub(
        settlementTimestamp1,
      ),
    });

    // Settled event emitted with correct settlement values
    await assertEvent(settleTx, 'Settled', {
      comptrollerProxy: mockComptrollerProxy.address,
      sharesQuantity: expectedSharesDueForTx,
      prevSettled: BigNumber.from(settlementTimestamp1),
    });

    // Fee info should be updated with lastSettled, even though no shares were due
    const getFeeInfoForFundCall = standaloneManagementFee.getFeeInfoForFund(
      mockComptrollerProxy,
    );
    await expect(getFeeInfoForFundCall).resolves.toMatchObject({
      rate: managementFeeRate,
      lastSettled: BigNumber.from(settlementTimestamp2),
    });
  });

  // How can we batch 2 txs into the same block?
  it.todo('returns 0 if lastSettled is the same block as a call');
});
