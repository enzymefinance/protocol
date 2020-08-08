import { BuidlerProvider, randomAddress } from '@crestproject/crestproject';
import { configureTestDeployment } from '../deployment';

let tx;

async function snapshot(provider: BuidlerProvider) {
  const deployment = await configureTestDeployment()(provider);
  return deployment;
}

describe('ChaiPriceFeed', () => {
  describe('constructor', () => {
    it('sets initial storage vars', async () => {
      const {
        system: { chaiPriceFeed },
        config: {
          pricefeeds: {
            chai: { chaiToken, daiToken, dsrPot },
          },
        },
      } = await provider.snapshot(snapshot);

      tx = chaiPriceFeed.CHAI();
      await expect(tx).resolves.toBe(chaiToken);

      tx = chaiPriceFeed.DAI();
      await expect(tx).resolves.toBe(daiToken);

      tx = chaiPriceFeed.DSR_POT();
      await expect(tx).resolves.toBe(dsrPot);
    });
  });

  describe('getRatesToUnderlyings', () => {
    it('only supports chai', async () => {
      const {
        system: { chaiPriceFeed },
        config: {
          tokens: { chai },
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
        system: { chaiPriceFeed },
        config: {
          tokens: { chai, dai },
          mocks: {
            priceSources: { chai: chaiPriceSource },
          },
        },
      } = await provider.snapshot(snapshot);

      tx = chaiPriceFeed.getRatesToUnderlyings(chai);
      await expect(tx).resolves.toBeReceipt();

      const chi = await chaiPriceSource.chi();

      tx = await chaiPriceFeed.getRatesToUnderlyings.args(chai).call();
      expect(tx).toMatchObject({
        rates_: [chi.div(10 ** 9)],
        underlyings_: [dai.address],
      });
    });

    it('calls drip() if necessary', async () => {
      const {
        system: { chaiPriceFeed },
        config: {
          tokens: { chai },
          mocks: {
            priceSources: { chai: chaiPriceSource },
          },
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
