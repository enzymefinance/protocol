import {
  EthereumTestnetProvider,
  randomAddress,
} from '@crestproject/crestproject';
import { defaultTestDeployment } from '@melonproject/testutils';

async function snapshot(provider: EthereumTestnetProvider) {
  const { deployment, config } = await defaultTestDeployment(provider);

  return {
    deployment,
    config,
  };
}

describe('constructor', () => {
  it('sets initial storage vars', async () => {
    const {
      deployment: { chaiPriceFeed },
      config: {
        derivatives: { chai },
        integratees: {
          makerDao: { pot, dai },
        },
      },
    } = await provider.snapshot(snapshot);

    await expect(chaiPriceFeed.getChai()).resolves.toMatchAddress(chai);
    await expect(chaiPriceFeed.getDai()).resolves.toMatchAddress(dai);
    await expect(chaiPriceFeed.getDsrPot()).resolves.toMatchAddress(pot);
  });
});

describe('getRatesToUnderlyings', () => {
  it('only supports chai', async () => {
    const {
      deployment: { chaiPriceFeed },
      config: {
        derivatives: { chai },
      },
    } = await provider.snapshot(snapshot);
    const derivative = randomAddress();

    await expect(
      chaiPriceFeed.getRatesToUnderlyings(derivative),
    ).rejects.toBeRevertedWith('Only Chai is supported');

    await expect(
      chaiPriceFeed.getRatesToUnderlyings(chai),
    ).resolves.toBeReceipt();
  });

  it('returns rate for underlying dai', async () => {
    const {
      deployment: { chaiPriceFeed, chaiPriceSource },
      config: {
        derivatives: { chai },
        integratees: {
          makerDao: { dai },
        },
      },
    } = await provider.snapshot(snapshot);

    await expect(
      chaiPriceFeed.getRatesToUnderlyings(chai),
    ).resolves.toBeReceipt();

    const chi = await chaiPriceSource.chi();
    await expect(
      chaiPriceFeed.getRatesToUnderlyings.args(chai).call(),
    ).resolves.toMatchFunctionOutput(
      chaiPriceFeed.getRatesToUnderlyings.fragment,
      {
        rates_: [chi.div(10 ** 9)],
        underlyings_: [dai],
      },
    );
  });

  it('calls drip() if necessary', async () => {
    const {
      deployment: { chaiPriceFeed, chaiPriceSource },
      config: {
        derivatives: { chai },
      },
    } = await provider.snapshot(snapshot);

    const before = await provider.getBlock('latest');
    const rhoBefore = await chaiPriceSource.rho();
    expect(rhoBefore).toBeLteBigNumber(before.timestamp);

    await chaiPriceFeed.getRatesToUnderlyings(chai);

    const after = await provider.getBlock('latest');
    const rhoAfter = await chaiPriceSource.rho();
    expect(rhoAfter).toBeGteBigNumber(after.timestamp);

    expect(chaiPriceSource.drip).toHaveBeenCalledOnContract();
  });
});
