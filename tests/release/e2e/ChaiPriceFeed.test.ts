import { EthereumTestnetProvider } from '@crestproject/crestproject';
import { IMakerDaoPot } from '@melonproject/protocol';
import { defaultForkDeployment } from '@melonproject/testutils';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultForkDeployment(provider);

  return {
    accounts,
    deployment,
    config,
  };
}

describe('getRatesToUnderlyings', () => {
  it('returns rate for underlying token dai', async () => {
    const {
      config: {
        deployer,
        derivatives: { chai },
        integratees: {
          makerDao: { pot: potAddress },
        },
        tokens: { dai },
      },
      deployment: { chaiPriceFeed },
    } = await provider.snapshot(snapshot);

    const pot = new IMakerDaoPot(potAddress, deployer);
    const chi = await pot.chi();

    const chaiGetPriceFeedReceipt = await chaiPriceFeed.getRatesToUnderlyings.args(chai).call();

    expect(chaiGetPriceFeedReceipt).toMatchFunctionOutput(chaiPriceFeed.getRatesToUnderlyings, {
      rates_: [chi.div(10 ** 9)],
      underlyings_: [dai],
    });
  });
});
