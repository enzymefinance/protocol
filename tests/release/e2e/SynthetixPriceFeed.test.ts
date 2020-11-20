import { utils } from 'ethers';
import { EthereumTestnetProvider } from '@crestproject/crestproject';
import { synthetixResolveAddress, ISynthetixExchangeRates } from '@melonproject/protocol';
import { defaultForkDeployment } from '@melonproject/testutils';

async function snapshot(provider: EthereumTestnetProvider) {
  return await defaultForkDeployment(provider);
}

it('returns rate for underlying token', async () => {
  const {
    config: {
      deployer,
      integratees: {
        synthetix: { addressResolver, sbtc, susd },
      },
    },
    deployment: { synthetixPriceFeed },
  } = await provider.snapshot(snapshot);

  const exchangeRates = await synthetixResolveAddress({
    addressResolver,
    name: 'ExchangeRates',
    signer: deployer,
  });

  const synthetixExchangeRate = new ISynthetixExchangeRates(exchangeRates, deployer);
  await synthetixPriceFeed.getRatesToUnderlyings(sbtc);

  // Synthetix rates
  const { '0': expectedRate } = await synthetixExchangeRate.rateAndInvalid(utils.formatBytes32String('sBTC'));

  // Internal feed rates
  const feedRate = await synthetixPriceFeed.getRatesToUnderlyings.args(sbtc).call();

  expect(feedRate).toMatchFunctionOutput(synthetixPriceFeed.getRatesToUnderlyings.fragment, {
    rates_: [expectedRate],
    underlyings_: [susd],
  });
});

it('returns supported for a valid synth', async () => {
  const {
    config: {
      weth,
      integratees: {
        synthetix: { sbtc },
      },
    },
    deployment: { synthetixPriceFeed },
  } = await provider.snapshot(snapshot);

  await expect(synthetixPriceFeed.isSupportedAsset(sbtc)).resolves.toBe(true);

  await expect(synthetixPriceFeed.isSupportedAsset(weth)).resolves.toBe(false);
});
