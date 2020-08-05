import { utils, BigNumber, BigNumberish } from 'ethers';
import { BuidlerProvider } from '@crestproject/crestproject';
import { configureTestDeployment } from '../deployment';

let tx;

function inverseNormalizedRate(rate: BigNumberish, precision: number = 18) {
  return BigNumber.from(10).pow(BigNumber.from(precision).mul(2)).div(rate);
}

async function snapshot(provider: BuidlerProvider) {
  const deployment = await configureTestDeployment()(provider);

  return {
    ...deployment,
  };
}

describe('KyberPriceFeed', () => {
  describe('constructor', () => {
    it('sets initial storage vars', async () => {
      const {
        system: { kyberPriceFeed, registry },
        config: {
          pricefeeds: {
            kyber: {
              expectedRateWethQty,
              kyberNetworkProxy,
              maxPriceDeviation,
              maxSpread,
              quoteAsset,
              updater,
            },
          },
        },
      } = await provider.snapshot(snapshot);

      tx = kyberPriceFeed.KYBER_NETWORK_PROXY();
      await expect(tx).resolves.toBe(kyberNetworkProxy);

      tx = kyberPriceFeed.PRICE_FEED_QUOTE_ASSET();
      await expect(tx).resolves.toBe(quoteAsset);

      tx = kyberPriceFeed.registry();
      await expect(tx).resolves.toBe(registry.address);

      tx = kyberPriceFeed.expectedRateWethQty();
      await expect(tx).resolves.toEqBigNumber(expectedRateWethQty);

      tx = kyberPriceFeed.maxPriceDeviation();
      await expect(tx).resolves.toEqBigNumber(maxPriceDeviation);

      tx = kyberPriceFeed.maxSpread();
      await expect(tx).resolves.toEqBigNumber(maxSpread);

      tx = kyberPriceFeed.updater();
      await expect(tx).resolves.toBe(updater);
    });
  });

  describe('getLiveRate', () => {
    it('returns invalid when spread is greater than maxSpread', async () => {
      const {
        system: { kyberPriceFeed },
        config: {
          mocks: {
            priceSources: { kyber: kyberPriceSource },
          },
          tokens: { mln, dai },
        },
      } = await provider.snapshot(snapshot);

      const maxSpread = await kyberPriceFeed.maxSpread();

      // Get rate for dai quoted in mln

      // Set backwards rate (ask) to 1 to simplify math
      const askRate = utils.parseEther('1');
      await kyberPriceSource.setRates([mln], [dai], [askRate]);

      // Set the bid rate to be exactly the maxSpread
      const desiredIBidRate = askRate
        .mul(utils.parseEther('1'))
        .div(utils.parseEther('1').sub(maxSpread));
      const goodBidRate = inverseNormalizedRate(desiredIBidRate);
      await kyberPriceSource.setRates([dai], [mln], [goodBidRate]);

      tx = await kyberPriceFeed.getLiveRate(dai, mln);
      expect(tx.isValid_).toBe(true);

      // Decreasing the bid rate by 1 wei should make it invalid
      await kyberPriceSource.setRates([dai], [mln], [goodBidRate.sub(1)]);
      tx = await kyberPriceFeed.getLiveRate(dai, mln);
      expect(tx.isValid_).toBe(false);
    });
  });

  it('returns invalid when either bid or ask rate is 0', async () => {
    const {
      system: { kyberPriceFeed },
      config: {
        mocks: {
          priceSources: { kyber: kyberPriceSource },
        },
        tokens: { mln, dai },
      },
    } = await provider.snapshot(snapshot);

    const baseAsset = mln;
    const quoteAsset = dai;

    // Set bid rate to 0, expect invalid rate
    await kyberPriceSource.setRates(
      [baseAsset, quoteAsset],
      [quoteAsset, baseAsset],
      [utils.parseEther('0'), utils.parseEther('1')],
    );
    tx = await kyberPriceFeed.getLiveRate(baseAsset, quoteAsset);
    expect(tx.isValid_).toBe(false);

    // Set ask rate to 0, expect invalid rate
    await kyberPriceSource.setRates(
      [baseAsset, quoteAsset],
      [quoteAsset, baseAsset],
      [utils.parseEther('1'), utils.parseEther('0')],
    );
    tx = await kyberPriceFeed.getLiveRate(baseAsset, quoteAsset);
    expect(tx.isValid_).toBe(false);

    // Start both rates to 1, expect a valid rate
    await kyberPriceSource.setRates(
      [baseAsset, quoteAsset],
      [quoteAsset, baseAsset],
      [utils.parseEther('1'), utils.parseEther('1')],
    );
    tx = await kyberPriceFeed.getLiveRate(baseAsset, quoteAsset);
    expect(tx.isValid_).toBe(true);
  });

  it.todo('continue writing tests!');
});
