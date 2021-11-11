/*
 * @file Only tests the EntranceRateBurnFee functionality not covered by
 * the EntranceRateFeeBase tests, i.e., the use of settlement type
 */

import { randomAddress } from '@enzymefinance/ethers';
import {
  EntranceRateBurnFee,
  entranceRateBurnFeeConfigArgs,
  entranceRateFeeSharesDue,
  FeeHook,
  FeeSettlementType,
  settlePostBuySharesArgs,
} from '@enzymefinance/protocol';
import { assertEvent, deployProtocolFixture } from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

const TEN_PERCENT = BigNumber.from(1000);

describe('config', () => {
  it('has correct config', async () => {
    const entranceRateBurnFee = fork.deployment.entranceRateBurnFee;

    for (const hook of Object.values(FeeHook)) {
      expect(await entranceRateBurnFee.settlesOnHook(hook)).toMatchFunctionOutput(entranceRateBurnFee.settlesOnHook, {
        settles_: hook === FeeHook.PostBuyShares,
        usesGav_: false,
      });
      expect(await entranceRateBurnFee.updatesOnHook(hook)).toMatchFunctionOutput(entranceRateBurnFee.updatesOnHook, {
        updates_: false,
        usesGav_: false,
      });
    }

    expect(await entranceRateBurnFee.getSettlementType()).toMatchFunctionOutput(
      entranceRateBurnFee.getSettlementType.fragment,
      FeeSettlementType.Burn,
    );
  });
});

describe('settle', () => {
  it('correctly handles valid call', async () => {
    const fork = await deployProtocolFixture();
    const [EOAFeeManager] = fork.accounts;
    const standaloneEntranceRateFee = await EntranceRateBurnFee.deploy(fork.deployer, EOAFeeManager);

    // Add fee settings for a random ComptrollerProxy address
    const comptrollerProxyAddress = randomAddress();
    const rate = TEN_PERCENT;
    const entranceRateFeeConfig = entranceRateBurnFeeConfigArgs({ rate });
    await standaloneEntranceRateFee
      .connect(EOAFeeManager)
      .addFundSettings(comptrollerProxyAddress, entranceRateFeeConfig);

    // Create settlementData
    const buyer = randomAddress();
    const sharesBought = utils.parseEther('2');
    const investmentAmount = utils.parseEther('2');
    const settlementData = settlePostBuySharesArgs({
      buyer,
      investmentAmount,
      sharesBought,
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
      payer_: buyer,
      settlementType_: FeeSettlementType.Burn,
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
