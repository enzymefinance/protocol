import { BuidlerProvider, randomAddress } from '@crestproject/crestproject';
import { defaultTestDeployment } from '../../../';

let tx;

async function snapshot(provider: BuidlerProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(
    provider,
  );

  return {
    accounts,
    deployment,
    config,
  };
}

describe('ChaiPriceFeed', () => {
  describe('constructor', () => {
    it('sets initial storage vars', async () => {
      const {
        deployment: { chaiPriceFeed },
        config: {
          derivatives: { chai },
          makerDao: { pot, dai },
        },
      } = await provider.snapshot(snapshot);

      tx = chaiPriceFeed.getChai();
      await expect(tx).resolves.toBe(chai);

      tx = chaiPriceFeed.getDai();
      await expect(tx).resolves.toBe(dai);

      tx = chaiPriceFeed.getDsrPot();
      await expect(tx).resolves.toBe(pot);
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

      tx = chaiPriceFeed.getRatesToUnderlyings(derivative);
      await expect(tx).rejects.toBeRevertedWith('only Chai is supported');

      tx = chaiPriceFeed.getRatesToUnderlyings(chai);
      await expect(tx).resolves.toBeReceipt();
    });

    it('returns rate for underlying dai', async () => {
      const {
        deployment: { chaiPriceFeed, chaiPriceSource },
        config: {
          derivatives: { chai },
          makerDao: { dai },
        },
      } = await provider.snapshot(snapshot);
      tx = chaiPriceFeed.getRatesToUnderlyings(chai);
      await expect(tx).resolves.toBeReceipt();

      const chi = await chaiPriceSource.chi();

      tx = await chaiPriceFeed.getRatesToUnderlyings.args(chai).call();
      expect(tx).toMatchObject({
        rates_: [chi.div(10 ** 9)],
        underlyings_: [dai],
      });
    });

    it('calls drip() if necessary', async () => {
      const {
        deployment: { chaiPriceFeed, chaiPriceSource },
        config: {
          derivatives: { chai },
        },
      } = await provider.snapshot(snapshot);

      const before = await provider.getBlock('latest');
      tx = chaiPriceSource.rho();
      await expect(tx).resolves.toBeLteBigNumber(before.timestamp);

      tx = chaiPriceFeed.getRatesToUnderlyings(chai);
      await expect(tx).resolves.toBeReceipt();

      const after = await provider.getBlock('latest');
      tx = chaiPriceSource.rho();
      await expect(tx).resolves.toBeGteBigNumber(after.timestamp);

      expect(chaiPriceSource.drip).toHaveBeenCalledOnContract();
    });
  });
});
