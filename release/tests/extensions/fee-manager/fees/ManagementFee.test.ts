import { BigNumber, constants, utils } from 'ethers';
import { BuidlerProvider, randomAddress } from '@crestproject/crestproject';
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

async function snapshot(provider: BuidlerProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(
    provider,
  );

  return {
    accounts,
    deployment,
    config,
    managementFeeRate: utils.parseEther('.1'), // 10%
  };
}

async function snapshotWithStandaloneFee(provider: BuidlerProvider) {
  const {
    accounts,
    config,
    deployment,
    managementFeeRate,
  } = await provider.snapshot(snapshot);

  const [EOAFeeManager, ...remainingAccounts] = accounts;
  const managementFee = await ManagementFee.deploy(
    config.deployer,
    EOAFeeManager,
  );

  return {
    accounts: remainingAccounts,
    comptrollerProxy: randomAddress(),
    config,
    deployment,
    EOAFeeManager,
    managementFee,
    managementFeeRate,
  };
}

async function snapshotWithStandaloneFeeAndMocks(provider: BuidlerProvider) {
  const {
    accounts,
    config,
    deployment,
    EOAFeeManager,
    managementFee,
    managementFeeRate,
  } = await provider.snapshot(snapshotWithStandaloneFee);

  // Mock the VaultProxy
  const mockVaultProxy = await VaultLib.mock(config.deployer);
  await mockVaultProxy.totalSupply.returns(0);

  // Mock the ComptrollerProxy
  const mockComptrollerProxy = await ComptrollerLib.mock(config.deployer);
  await mockComptrollerProxy.getVaultProxy.returns(mockVaultProxy.address);

  // Add fee settings for ComptrollerProxy
  const managementFeeConfig = await managementFeeConfigArgs(managementFeeRate);
  await managementFee
    .connect(EOAFeeManager)
    .addFundSettings(mockComptrollerProxy, managementFeeConfig);

  return {
    accounts,
    deployment,
    EOAFeeManager,
    managementFee,
    managementFeeRate,
    mockComptrollerProxy,
    mockVaultProxy,
  };
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      deployment: { feeManager, managementFee },
    } = await provider.snapshot(snapshot);

    const getFeeManagerCall = managementFee.getFeeManager();
    await expect(getFeeManagerCall).resolves.toBe(feeManager.address);

    const feeHookCall = managementFee.feeHook();
    await expect(feeHookCall).resolves.toBe(feeHooks.Continuous);
  });
});

describe('addFundSettings', () => {
  it('can only be called by the FeeManager', async () => {
    const {
      comptrollerProxy,
      managementFee,
      managementFeeRate,
    } = await provider.snapshot(snapshotWithStandaloneFee);

    const managementFeeConfig = await managementFeeConfigArgs(
      managementFeeRate,
    );
    const addFundSettingsTx = managementFee.addFundSettings(
      comptrollerProxy,
      managementFeeConfig,
    );

    await expect(addFundSettingsTx).rejects.toBeRevertedWith(
      'Only the FeeManger can make this call',
    );
  });

  it('sets initial config values for fund and fires events', async () => {
    const {
      comptrollerProxy,
      EOAFeeManager,
      managementFee,
      managementFeeRate,
    } = await provider.snapshot(snapshotWithStandaloneFee);

    const managementFeeConfig = await managementFeeConfigArgs(
      managementFeeRate,
    );
    const addFundSettingsTx = managementFee
      .connect(EOAFeeManager)
      .addFundSettings(comptrollerProxy, managementFeeConfig);
    await expect(addFundSettingsTx).resolves.toBeReceipt();

    // managementFeeRate should be set for comptrollerProxy
    const getFeeInfoForFundCall = managementFee.getFeeInfoForFund(
      comptrollerProxy,
    );
    await expect(getFeeInfoForFundCall).resolves.toMatchObject({
      rate: managementFeeRate,
      lastSettled: BigNumber.from(0),
    });

    // Assert the FundSettingsAdded event was emitted
    await assertEvent(addFundSettingsTx, 'FundSettingsAdded', {
      comptrollerProxy,
      rate: managementFeeRate,
    });
  });
});

describe('payout', () => {
  it('returns false', async () => {
    const { comptrollerProxy, managementFee } = await provider.snapshot(
      snapshotWithStandaloneFee,
    );

    const payoutCall = managementFee.payout.args(comptrollerProxy).call();

    await expect(payoutCall).resolves.toBeFalsy();
  });
});

describe('settle', () => {
  it('can only be called by the FeeManager', async () => {
    const { mockComptrollerProxy, managementFee } = await provider.snapshot(
      snapshotWithStandaloneFeeAndMocks,
    );

    const settleTx = managementFee.settle(mockComptrollerProxy, '0x');

    await expect(settleTx).rejects.toBeRevertedWith(
      'Only the FeeManger can make this call',
    );
  });

  it('correctly handles shares supply of 0', async () => {
    const {
      EOAFeeManager,
      mockComptrollerProxy,
      managementFee,
      managementFeeRate,
    } = await provider.snapshot(snapshotWithStandaloneFeeAndMocks);

    // Check the return value via a call
    const settleCall = managementFee
      .connect(EOAFeeManager)
      .settle.args(mockComptrollerProxy, '0x')
      .call();
    await expect(settleCall).resolves.toMatchObject({
      0: feeSettlementTypes.None,
      1: constants.AddressZero,
      2: BigNumber.from(0),
    });

    // Send the tx to actually settle
    const settleTx = managementFee
      .connect(EOAFeeManager)
      .settle(mockComptrollerProxy, '0x');
    await expect(settleTx).resolves.toBeReceipt();
    const settlementTimestamp = (await provider.getBlock('latest')).timestamp;

    // Fee info should be updated with lastSettled, even though no shares were due
    const getFeeInfoForFundCall = managementFee.getFeeInfoForFund(
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
      managementFee,
      managementFeeRate,
      mockVaultProxy,
    } = await provider.snapshot(snapshotWithStandaloneFeeAndMocks);

    // Settle while shares supply is 0 to set lastSettled
    await managementFee
      .connect(EOAFeeManager)
      .settle(mockComptrollerProxy, '0x');
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
    const settleCall = managementFee
      .connect(EOAFeeManager)
      .settle.args(mockComptrollerProxy, '0x')
      .call();

    await expect(settleCall).resolves.toMatchObject({
      0: feeSettlementTypes.Mint,
      1: constants.AddressZero,
      2: expectedSharesDueForCall,
    });

    // Send the tx to actually settle()
    const settleTx = managementFee
      .connect(EOAFeeManager)
      .settle(mockComptrollerProxy, '0x');
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
    const getFeeInfoForFundCall = managementFee.getFeeInfoForFund(
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
