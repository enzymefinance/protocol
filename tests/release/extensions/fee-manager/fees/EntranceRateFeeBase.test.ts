/*
 * @file Uses the EntranceRateDirectFee to test the basic functionality of an EntranceRateFeeBase
 * that does not rely on settlement type
 */

import { utils } from 'ethers';
import {
  EthereumTestnetProvider,
  randomAddress,
} from '@crestproject/crestproject';
import { EntranceRateDirectFee } from '@melonproject/protocol';
import {
  assertEvent,
  feeHooks,
  defaultTestDeployment,
  entranceRateFeeConfigArgs,
  settlePostBuySharesArgs,
} from '@melonproject/testutils';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(
    provider,
  );

  // Create standalone EntranceRateDirectFee
  const [EOAFeeManager, ...remainingAccounts] = accounts;
  const standaloneEntranceRateFee = await EntranceRateDirectFee.deploy(
    config.deployer,
    EOAFeeManager,
  );

  return {
    accounts: remainingAccounts,
    config,
    deployment,
    EOAFeeManager,
    standaloneEntranceRateFee,
  };
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      deployment: { feeManager, entranceRateDirectFee },
    } = await provider.snapshot(snapshot);

    const getFeeManagerCall = entranceRateDirectFee.getFeeManager();
    await expect(getFeeManagerCall).resolves.toBe(feeManager.address);

    // Implements expected hooks
    const implementedHooksCall = entranceRateDirectFee.implementedHooks();
    await expect(implementedHooksCall).resolves.toMatchObject([
      feeHooks.PostBuyShares,
    ]);
  });
});

describe('addFundSettings', () => {
  it('can only be called by the FeeManager', async () => {
    const { standaloneEntranceRateFee } = await provider.snapshot(snapshot);

    const entranceRateFeeConfig = await entranceRateFeeConfigArgs(1);
    const addFundSettingsTx = standaloneEntranceRateFee.addFundSettings(
      randomAddress(),
      entranceRateFeeConfig,
    );

    await expect(addFundSettingsTx).rejects.toBeRevertedWith(
      'Only the FeeManger can make this call',
    );
  });

  it('correctly handles valid call', async () => {
    const {
      EOAFeeManager,
      standaloneEntranceRateFee,
    } = await provider.snapshot(snapshot);

    // Add fee config for a random comptrollerProxyAddress
    const comptrollerProxyAddress = randomAddress();
    const rate = utils.parseEther('1');
    const entranceRateFeeConfig = await entranceRateFeeConfigArgs(rate);
    const addFundSettingsTx = standaloneEntranceRateFee
      .connect(EOAFeeManager)
      .addFundSettings(comptrollerProxyAddress, entranceRateFeeConfig);
    await expect(addFundSettingsTx).resolves.toBeReceipt();

    // Assert state has been set
    const getRateForFundCall = standaloneEntranceRateFee.getRateForFund(
      comptrollerProxyAddress,
    );
    await expect(getRateForFundCall).resolves.toEqBigNumber(rate);

    // Assert the FundSettingsAdded event was emitted
    await assertEvent(addFundSettingsTx, 'FundSettingsAdded', {
      comptrollerProxy: comptrollerProxyAddress,
      rate,
    });
  });
});

describe('payout', () => {
  it('returns false', async () => {
    const { standaloneEntranceRateFee } = await provider.snapshot(snapshot);

    const payoutCall = standaloneEntranceRateFee.payout
      .args(randomAddress(), randomAddress())
      .call();
    await expect(payoutCall).resolves.toBe(false);
  });
});

describe('settle', () => {
  it('can only be called by the FeeManager', async () => {
    const { standaloneEntranceRateFee } = await provider.snapshot(snapshot);

    const settlementData = await settlePostBuySharesArgs({});
    const settleTx = standaloneEntranceRateFee.settle(
      randomAddress(),
      randomAddress(),
      feeHooks.PostBuyShares,
      settlementData,
    );

    await expect(settleTx).rejects.toBeRevertedWith(
      'Only the FeeManger can make this call',
    );
  });
});
