/*
 * @file Only tests the EntranceRateBurnFee functionality not covered by
 * the EntranceRateFeeBase tests, i.e., the use of settlement type
 */

import { BigNumber, utils } from 'ethers';
import {
  EthereumTestnetProvider,
  randomAddress,
} from '@crestproject/crestproject';
import { EntranceRateBurnFee } from '@melonproject/protocol';
import {
  assertEvent,
  feeHooks,
  feeSettlementTypes,
  defaultTestDeployment,
  entranceRateFeeConfigArgs,
  entranceRateFeeSharesDue,
  settlePostBuySharesArgs,
} from '@melonproject/testutils';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(
    provider,
  );

  // Create standalone EntranceRateBurnFee
  const [EOAFeeManager, ...remainingAccounts] = accounts;
  const standaloneEntranceRateFee = await EntranceRateBurnFee.deploy(
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
      deployment: { entranceRateBurnFee },
    } = await provider.snapshot(snapshot);

    const getSettlementTypeCall = entranceRateBurnFee.getSettlementType();
    await expect(getSettlementTypeCall).resolves.toBe(feeSettlementTypes.Burn);
  });
});

describe('settle', () => {
  it('correctly handles valid call', async () => {
    const {
      EOAFeeManager,
      standaloneEntranceRateFee,
    } = await provider.snapshot(snapshot);

    // Add fee settings for a random ComptrollerProxy address
    const comptrollerProxyAddress = randomAddress();
    const rate = utils.parseEther('.1'); // 10%
    const entranceRateFeeConfig = await entranceRateFeeConfigArgs(rate);
    await standaloneEntranceRateFee
      .connect(EOAFeeManager)
      .addFundSettings(comptrollerProxyAddress, entranceRateFeeConfig);

    // Create settlementData
    const buyer = randomAddress();
    const sharesBought = utils.parseEther('2');
    const settlementData = await settlePostBuySharesArgs({
      buyer,
      sharesBought,
    });

    // Get the expected shares due for the settlement
    const expectedSharesDueForCall = entranceRateFeeSharesDue({
      rate: rate,
      sharesBought,
    });

    // Check the return values via a call() to settle()
    const settleCall = standaloneEntranceRateFee
      .connect(EOAFeeManager)
      .settle.args(
        comptrollerProxyAddress,
        randomAddress(),
        feeHooks.PostBuyShares,
        settlementData,
      )
      .call();
    await expect(settleCall).resolves.toMatchObject({
      0: feeSettlementTypes.Burn,
      1: buyer,
      2: expectedSharesDueForCall,
    });

    // Send the tx to actually settle()
    const settleTx = standaloneEntranceRateFee
      .connect(EOAFeeManager)
      .settle(
        comptrollerProxyAddress,
        randomAddress(),
        feeHooks.PostBuyShares,
        settlementData,
      );
    await expect(settleTx).resolves.toBeReceipt();

    // Assert the event was emitted
    await assertEvent(settleTx, 'Settled', {
      comptrollerProxy: comptrollerProxyAddress,
      payer: buyer,
      sharesQuantity: BigNumber.from(expectedSharesDueForCall),
    });
  });
});
