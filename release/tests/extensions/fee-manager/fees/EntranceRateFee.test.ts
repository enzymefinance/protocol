import { BigNumber, utils } from 'ethers';
import {
  EthereumTestnetProvider,
  randomAddress,
} from '@crestproject/crestproject';
import { assertEvent } from '@melonproject/utils';
import { defaultTestDeployment } from '../../../../';
import { EntranceRateFee } from '../../../../utils/contracts';
import {
  feeHooks,
  feeSettlementTypes,
  entranceRateFeeConfigArgs,
  entranceRateFeeSharesDue,
  settleBuySharesArgs,
} from '../../../utils';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(
    provider,
  );

  // Create standalone EntranceRateFee
  const [EOAFeeManager, ...remainingAccounts] = accounts;
  const standaloneEntranceRateFee = await EntranceRateFee.deploy(
    config.deployer,
    EOAFeeManager,
  );

  // Add fee settings for a random ComptrollerProxy address
  const configuredComptrollerProxyAddress = randomAddress();
  const entranceRateFeeRate = utils.parseEther('.1'); // 10%
  const entranceRateFeeConfig = await entranceRateFeeConfigArgs(
    entranceRateFeeRate,
  );
  await standaloneEntranceRateFee
    .connect(EOAFeeManager)
    .addFundSettings(configuredComptrollerProxyAddress, entranceRateFeeConfig);

  return {
    accounts: remainingAccounts,
    configuredComptrollerProxyAddress,
    config,
    deployment,
    EOAFeeManager,
    entranceRateFeeRate,
    standaloneEntranceRateFee,
  };
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      deployment: { feeManager, entranceRateFee },
    } = await provider.snapshot(snapshot);

    const getFeeManagerCall = entranceRateFee.getFeeManager();
    await expect(getFeeManagerCall).resolves.toBe(feeManager.address);

    const feeHookCall = entranceRateFee.feeHook();
    await expect(feeHookCall).resolves.toBe(feeHooks.BuyShares);
  });
});

describe('addFundSettings', () => {
  it('can only be called by the FeeManager', async () => {
    const {
      entranceRateFeeRate,
      standaloneEntranceRateFee,
    } = await provider.snapshot(snapshot);

    const entranceRateFeeConfig = await entranceRateFeeConfigArgs(
      entranceRateFeeRate,
    );
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
      entranceRateFeeRate,
      EOAFeeManager,
      standaloneEntranceRateFee,
    } = await provider.snapshot(snapshot);

    // Add fee config for a random comptrollerProxyAddress
    const comptrollerProxyAddress = randomAddress();
    const entranceRateFeeConfig = await entranceRateFeeConfigArgs(
      entranceRateFeeRate,
    );
    const addFundSettingsTx = standaloneEntranceRateFee
      .connect(EOAFeeManager)
      .addFundSettings(comptrollerProxyAddress, entranceRateFeeConfig);
    await expect(addFundSettingsTx).resolves.toBeReceipt();

    // Assert state has been set
    const getRateForFundCall = standaloneEntranceRateFee.getRateForFund(
      comptrollerProxyAddress,
    );
    await expect(getRateForFundCall).resolves.toEqBigNumber(
      entranceRateFeeRate,
    );

    // Assert the FundSettingsAdded event was emitted
    await assertEvent(addFundSettingsTx, 'FundSettingsAdded', {
      comptrollerProxy: comptrollerProxyAddress,
      rate: entranceRateFeeRate,
    });
  });
});

describe('payout', () => {
  it('returns false', async () => {
    const {
      configuredComptrollerProxyAddress,
      standaloneEntranceRateFee,
    } = await provider.snapshot(snapshot);

    const payoutCall = standaloneEntranceRateFee.payout
      .args(configuredComptrollerProxyAddress)
      .call();
    await expect(payoutCall).resolves.toBe(false);
  });
});

describe('settle', () => {
  it('can only be called by the FeeManager', async () => {
    const {
      configuredComptrollerProxyAddress,
      standaloneEntranceRateFee,
    } = await provider.snapshot(snapshot);

    const settlementData = await settleBuySharesArgs({});
    const settleTx = standaloneEntranceRateFee.settle(
      configuredComptrollerProxyAddress,
      settlementData,
    );

    await expect(settleTx).rejects.toBeRevertedWith(
      'Only the FeeManger can make this call',
    );
  });

  it('correctly handles valid call', async () => {
    const {
      configuredComptrollerProxyAddress,
      entranceRateFeeRate,
      EOAFeeManager,
      standaloneEntranceRateFee,
    } = await provider.snapshot(snapshot);

    // Create settlementData
    const buyer = randomAddress();
    const sharesBought = utils.parseEther('2');
    const settlementData = await settleBuySharesArgs({
      buyer,
      sharesBought,
    });

    // Get the expected shares due for the settlement
    const expectedSharesDueForCall = entranceRateFeeSharesDue({
      rate: entranceRateFeeRate,
      sharesBought,
    });

    // Check the return values via a call() to settle()
    const settleCall = standaloneEntranceRateFee
      .connect(EOAFeeManager)
      .settle.args(configuredComptrollerProxyAddress, settlementData)
      .call();
    await expect(settleCall).resolves.toMatchObject({
      0: feeSettlementTypes.Direct,
      1: buyer,
      2: expectedSharesDueForCall,
    });

    // Send the tx to actually settle()
    const settleTx = standaloneEntranceRateFee
      .connect(EOAFeeManager)
      .settle(configuredComptrollerProxyAddress, settlementData);
    await expect(settleTx).resolves.toBeReceipt();

    // Assert the event was emitted
    await assertEvent(settleTx, 'Settled', {
      comptrollerProxy: configuredComptrollerProxyAddress,
      payer: buyer,
      sharesQuantity: BigNumber.from(expectedSharesDueForCall),
    });
  });
});
