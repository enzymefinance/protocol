import { EthereumTestnetProvider, randomAddress } from '@crestproject/crestproject';
import { defaultTestDeployment } from '@enzymefinance/testutils';
import { utils } from 'ethers';

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

describe('calcUnderlyingValues', () => {
  it('only supports chai', async () => {
    const {
      deployment: { chaiPriceFeed },
      config: {
        derivatives: { chai },
      },
    } = await provider.snapshot(snapshot);
    const derivative = randomAddress();

    await expect(chaiPriceFeed.calcUnderlyingValues(derivative, 1)).rejects.toBeRevertedWith('Only Chai is supported');

    await expect(chaiPriceFeed.calcUnderlyingValues(chai, 1)).resolves.toBeReceipt();
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

    await expect(chaiPriceFeed.calcUnderlyingValues(chai, 1)).resolves.toBeReceipt();

    const chi = await chaiPriceSource.chi();
    await expect(
      chaiPriceFeed.calcUnderlyingValues.args(chai, utils.parseEther('1')).call(),
    ).resolves.toMatchFunctionOutput(chaiPriceFeed.calcUnderlyingValues, {
      underlyings_: [dai],
      underlyingAmounts_: [chi.div(10 ** 9)],
    });
  });
});
