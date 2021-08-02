import { randomAddress } from '@enzymefinance/ethers';
import {
  entranceRateBurnFeeConfigArgs,
  feeManagerConfigArgs,
  managementFeeConfigArgs,
  performanceFeeConfigArgs,
  WETH,
} from '@enzymefinance/protocol';
import { createNewFund, deployProtocolFixture } from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

const FIVE_PERCENT = BigNumber.from(500);
const TEN_PERCENT = BigNumber.from(1000);

async function snapshot() {
  const { accounts, deployment, config } = await deployProtocolFixture();

  // Get mock fees and mock policies data with which to configure funds
  const managementFeeSettings = managementFeeConfigArgs({ scaledPerSecondRate: utils.parseEther('0.01') });
  const performanceFeeSettings = performanceFeeConfigArgs({
    rate: TEN_PERCENT,
    period: 365 * 24 * 60 * 60,
  });
  const entranceRateBurnFeeSettings = entranceRateBurnFeeConfigArgs({ rate: FIVE_PERCENT });

  const feeManagerConfig = feeManagerConfigArgs({
    fees: [deployment.managementFee, deployment.performanceFee, deployment.entranceRateBurnFee],
    settings: [managementFeeSettings, performanceFeeSettings, entranceRateBurnFeeSettings],
  });

  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: accounts[1],
    fundDeployer: deployment.fundDeployer,
    denominationAsset: new WETH(config.weth, whales.weth),
    fundOwner: randomAddress(),
    feeManagerConfig,
  });

  return {
    accounts,
    deployment,
    config,
    comptrollerProxy,
    vaultProxy,
  };
}

describe('calcNetShareValueForFund', () => {
  it('correctly handles a valid call', async () => {
    const {
      deployment: { unpermissionedActionsWrapper },
      comptrollerProxy,
    } = await provider.snapshot(snapshot);

    const netShareValue = await unpermissionedActionsWrapper.calcNetShareValueForFund.args(comptrollerProxy).call();
    expect(netShareValue).toEqBigNumber(utils.parseEther('1'));
  });
});
