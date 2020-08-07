import { BuidlerProvider } from '@crestproject/crestproject';
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

  it.todo('Write more tests!');
});
