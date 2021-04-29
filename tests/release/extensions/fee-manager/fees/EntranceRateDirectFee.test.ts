/*
 * @file Only tests the EntranceRateDirectFee functionality not covered by
 * the EntranceRateFeeBase tests, i.e., the use of settlement type
 */

import { randomAddress } from '@enzymefinance/ethers';
import {
  EntranceRateDirectFee,
  FeeHook,
  FeeSettlementType,
  entranceRateFeeConfigArgs,
  entranceRateFeeSharesDue,
  settlePostBuySharesArgs,
  WETH,
} from '@enzymefinance/protocol';
import { assertEvent, deployProtocolFixture } from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

async function snapshot() {
  const {
    accounts: [EOAFeeManager, ...remainingAccounts],
    deployment,
    deployer,
    config,
  } = await deployProtocolFixture();

  // Create standalone EntranceRateDirectFee
  const standaloneEntranceRateFee = await EntranceRateDirectFee.deploy(deployer, EOAFeeManager);
  const denominationAsset = new WETH(config.weth, whales.weth);

  return {
    deployer,
    denominationAsset,
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
      deployment: { entranceRateDirectFee },
    } = await provider.snapshot(snapshot);

    const getSettlementTypeCall = await entranceRateDirectFee.getSettlementType();
    expect(getSettlementTypeCall).toBe(FeeSettlementType.Direct);
  });
});

describe('settle', () => {
  it('correctly handles valid call', async () => {
    const { EOAFeeManager, standaloneEntranceRateFee } = await provider.snapshot(snapshot);

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
    const investmentAmount = utils.parseEther('2');
    const settlementData = await settlePostBuySharesArgs({
      buyer,
      sharesBought,
      investmentAmount,
    });

    // Get the expected shares due for the settlement
    const expectedSharesDueForCall = entranceRateFeeSharesDue({
      rate,
      sharesBought,
    });

    // Check the return values via a call() to settle()
    const settleCall = await standaloneEntranceRateFee
      .connect(EOAFeeManager)
      .settle.args(comptrollerProxyAddress, randomAddress(), FeeHook.PostBuyShares, settlementData, 0)
      .call();

    expect(settleCall).toMatchFunctionOutput(standaloneEntranceRateFee.settle, {
      settlementType_: FeeSettlementType.Direct,
      payer_: buyer,
      sharesDue_: expectedSharesDueForCall,
    });

    // Send the tx to actually settle()
    const receipt = await standaloneEntranceRateFee
      .connect(EOAFeeManager)
      .settle(comptrollerProxyAddress, randomAddress(), FeeHook.PostBuyShares, settlementData, 0);

    // Assert the event was emitted
    assertEvent(receipt, 'Settled', {
      comptrollerProxy: comptrollerProxyAddress,
      payer: buyer,
      sharesQuantity: BigNumber.from(expectedSharesDueForCall),
    });
  });
});
