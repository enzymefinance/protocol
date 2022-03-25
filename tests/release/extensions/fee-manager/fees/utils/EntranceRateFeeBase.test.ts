// @file Uses the EntranceRateBurnFee to test the basic functionality of an EntranceRateFeeBase
// that does not rely on settlement type

import { randomAddress } from '@enzymefinance/ethers';
import {
  EntranceRateBurnFee,
  entranceRateBurnFeeConfigArgs,
  FeeHook,
  settlePostBuySharesArgs,
} from '@enzymefinance/protocol';
import type { ProtocolDeployment } from '@enzymefinance/testutils';
import { assertEvent, deployProtocolFixture } from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

const TEN_PERCENT = BigNumber.from(1000);

async function deployStandaloneEntranceRateFee(fork: ProtocolDeployment) {
  const [EOAFeeManager] = fork.accounts.slice(-1);

  let entranceRateFee = await EntranceRateBurnFee.deploy(fork.deployer, EOAFeeManager);

  entranceRateFee = entranceRateFee.connect(EOAFeeManager);

  return entranceRateFee;
}

describe('addFundSettings', () => {
  let fork: ProtocolDeployment;
  let entranceRateFee: EntranceRateBurnFee;

  beforeAll(async () => {
    fork = await deployProtocolFixture();
    entranceRateFee = await deployStandaloneEntranceRateFee(fork);
  });

  it('can only be called by the FeeManager', async () => {
    const [randomUser] = fork.accounts;
    const entranceRateFeeConfig = entranceRateBurnFeeConfigArgs({ rate: 1 });

    await expect(
      entranceRateFee.connect(randomUser).addFundSettings(randomAddress(), entranceRateFeeConfig),
    ).rejects.toBeRevertedWith('Only the FeeManger can make this call');
  });

  it('correctly handles valid call', async () => {
    // Add fee config for a random comptrollerProxyAddress
    const comptrollerProxyAddress = randomAddress();
    const rate = TEN_PERCENT;
    const entranceRateFeeConfig = entranceRateBurnFeeConfigArgs({ rate });
    const receipt = await entranceRateFee.addFundSettings(comptrollerProxyAddress, entranceRateFeeConfig);

    // Assert the FundSettingsAdded event was emitted
    assertEvent(receipt, 'FundSettingsAdded', {
      comptrollerProxy: comptrollerProxyAddress,
      rate,
    });

    // Assert state has been set
    const getRateForFundCall = await entranceRateFee.getRateForFund(comptrollerProxyAddress);

    expect(getRateForFundCall).toEqBigNumber(rate);
  });
});

describe('payout', () => {
  it('returns false', async () => {
    const fork = await deployProtocolFixture();
    const entranceRateFee = await deployStandaloneEntranceRateFee(fork);
    const payoutCall = await entranceRateFee.payout.args(randomAddress(), randomAddress()).call();

    expect(payoutCall).toBe(false);
  });
});

describe('settle', () => {
  it('can only be called by the FeeManager', async () => {
    const fork = await deployProtocolFixture();
    const entranceRateFee = await deployStandaloneEntranceRateFee(fork);
    const [randomUser] = fork.accounts;

    const settlementData = settlePostBuySharesArgs({
      buyer: randomAddress(),
      investmentAmount: utils.parseEther('1'),
      sharesBought: utils.parseEther('1'),
    });

    await expect(
      entranceRateFee
        .connect(randomUser)
        .settle(randomAddress(), randomAddress(), FeeHook.PostBuyShares, settlementData, 0),
    ).rejects.toBeRevertedWith('Only the FeeManger can make this call');
  });
});
