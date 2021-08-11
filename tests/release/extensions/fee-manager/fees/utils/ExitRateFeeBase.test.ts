/*
 * @file Uses the ExitRateBurnFee to test the basic functionality of an ExitRateFeeBase
 * that does not rely on settlement type
 */

import { randomAddress } from '@enzymefinance/ethers';
import {
  ExitRateBurnFee,
  exitRateBurnFeeConfigArgs,
  FeeHook,
  settlePreRedeemSharesArgs,
} from '@enzymefinance/protocol';
import { assertEvent, deployProtocolFixture, ProtocolDeployment } from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

const FIVE_PERCENT = BigNumber.from(500);
const TEN_PERCENT = BigNumber.from(1000);

async function deployStandaloneExitRateFee(fork: ProtocolDeployment) {
  const [EOAFeeManager] = fork.accounts.slice(-1);

  let exitRateFee = await ExitRateBurnFee.deploy(fork.deployer, EOAFeeManager);
  exitRateFee = exitRateFee.connect(EOAFeeManager);

  return exitRateFee;
}

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

describe('addFundSettings', () => {
  let exitRateFee: ExitRateBurnFee;

  beforeEach(async () => {
    exitRateFee = await deployStandaloneExitRateFee(fork);
  });

  it('can only be called by the FeeManager', async () => {
    const [randomUser] = fork.accounts;
    const exitRateFeeConfig = exitRateBurnFeeConfigArgs({});

    await expect(
      exitRateFee.connect(randomUser).addFundSettings(randomAddress(), exitRateFeeConfig),
    ).rejects.toBeRevertedWith('Only the FeeManger can make this call');
  });

  it('correctly handles valid call', async () => {
    // Add fee config for a random comptrollerProxyAddress
    const comptrollerProxyAddress = randomAddress();
    const inKindRate = TEN_PERCENT;
    const specificAssetsRate = FIVE_PERCENT;
    const exitRateFeeConfig = exitRateBurnFeeConfigArgs({ inKindRate, specificAssetsRate });
    const receipt = await exitRateFee.addFundSettings(comptrollerProxyAddress, exitRateFeeConfig);

    // Assert the FundSettingsAdded event was emitted
    assertEvent(receipt, 'FundSettingsAdded', {
      comptrollerProxy: comptrollerProxyAddress,
      inKindRate,
      specificAssetsRate,
    });

    // Assert state has been set
    expect(await exitRateFee.getInKindRateForFund(comptrollerProxyAddress)).toEqBigNumber(inKindRate);
    expect(await exitRateFee.getSpecificAssetsRateForFund(comptrollerProxyAddress)).toEqBigNumber(specificAssetsRate);
  });
});

describe('payout', () => {
  it('returns false', async () => {
    const exitRateFee = await deployStandaloneExitRateFee(fork);
    const payoutCall = await exitRateFee.payout.args(randomAddress(), randomAddress()).call();

    expect(payoutCall).toBe(false);
  });
});

describe('settle', () => {
  it('can only be called by the FeeManager', async () => {
    const exitRateFee = await deployStandaloneExitRateFee(fork);
    const [randomUser] = fork.accounts;

    const settlementData = settlePreRedeemSharesArgs({
      redeemer: randomAddress(),
      sharesToRedeem: utils.parseEther('1'),
      forSpecifiedAssets: true,
    });

    await expect(
      exitRateFee
        .connect(randomUser)
        .settle(randomAddress(), randomAddress(), FeeHook.PreRedeemShares, settlementData, 0),
    ).rejects.toBeRevertedWith('Only the FeeManger can make this call');
  });
});
