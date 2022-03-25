// @file Only tests the EntranceRateDirectFee functionality not covered by
// the EntranceRateFeeBase tests

import { randomAddress } from '@enzymefinance/ethers';
import {
  EntranceRateDirectFee,
  entranceRateDirectFeeConfigArgs,
  entranceRateFeeSharesDue,
  FeeHook,
  FeeSettlementType,
  settlePostBuySharesArgs,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import { assertEvent, deployProtocolFixture } from '@enzymefinance/testutils';
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, utils } from 'ethers';

const TEN_PERCENT = BigNumber.from(1000);

let fork: ProtocolDeployment;

beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('constructor', () => {
  it('has correct config', async () => {
    const entranceRateDirectFee = fork.deployment.entranceRateDirectFee;

    for (const hook of Object.values(FeeHook)) {
      expect(await entranceRateDirectFee.settlesOnHook(hook)).toMatchFunctionOutput(
        entranceRateDirectFee.settlesOnHook,
        {
          settles_: hook === FeeHook.PostBuyShares,
          usesGav_: false,
        },
      );
      expect(await entranceRateDirectFee.updatesOnHook(hook)).toMatchFunctionOutput(
        entranceRateDirectFee.updatesOnHook,
        {
          updates_: false,
          usesGav_: false,
        },
      );
    }

    expect(await entranceRateDirectFee.getSettlementType()).toMatchFunctionOutput(
      entranceRateDirectFee.getSettlementType.fragment,
      FeeSettlementType.Direct,
    );
  });
});

// Tests that the override of this function works properly
describe('addFundSettings', () => {
  const comptrollerProxyAddress = randomAddress();
  const feeRecipient = randomAddress();
  const rate = TEN_PERCENT;
  let entranceRateDirectFee: EntranceRateDirectFee;
  let EOAFeeManager: SignerWithAddress, randomUser: SignerWithAddress;

  beforeEach(async () => {
    [EOAFeeManager, randomUser] = fork.accounts;
    entranceRateDirectFee = await EntranceRateDirectFee.deploy(fork.deployer, EOAFeeManager);
  });

  it('can only be called by the FeeManager', async () => {
    await expect(
      entranceRateDirectFee
        .connect(randomUser)
        .addFundSettings(comptrollerProxyAddress, entranceRateDirectFeeConfigArgs({ rate, recipient: feeRecipient })),
    ).rejects.toBeRevertedWith('Only the FeeManger can make this call');
  });

  it('correctly handles valid call', async () => {
    await entranceRateDirectFee
      .connect(EOAFeeManager)
      .addFundSettings(comptrollerProxyAddress, entranceRateDirectFeeConfigArgs({ rate, recipient: feeRecipient }));

    // Assert rate has been set
    expect(await entranceRateDirectFee.getRateForFund(comptrollerProxyAddress)).toEqBigNumber(rate);

    // Assert the specified fee recipient has been set
    expect(await entranceRateDirectFee.getRecipientForFund(comptrollerProxyAddress)).toMatchAddress(feeRecipient);
  });
});

describe('settle', () => {
  it('correctly handles valid call', async () => {
    const [EOAFeeManager] = fork.accounts;
    const standaloneEntranceRateFee = await EntranceRateDirectFee.deploy(fork.deployer, EOAFeeManager);

    // Add fee settings for a random ComptrollerProxy address
    const comptrollerProxyAddress = randomAddress();
    const rate = TEN_PERCENT;
    const entranceRateFeeConfig = entranceRateDirectFeeConfigArgs({ rate });

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
      settlementType_: FeeSettlementType.Direct,
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
