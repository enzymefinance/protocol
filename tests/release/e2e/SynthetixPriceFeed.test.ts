import { EthereumTestnetProvider } from '@crestproject/crestproject';
import { ISynthetixExchangeRates } from '@melonproject/protocol';
import { defaultForkDeployment, synthetixResolveAddress } from '@melonproject/testutils';
import { utils } from 'ethers';

async function snapshot(provider: EthereumTestnetProvider) {
  return await defaultForkDeployment(provider);
}

it('returns rate for underlying token', async () => {
  const {
    config: {
      deployer,
      derivatives: {
        synthetix: { sbtc },
      },
      integratees: {
        synthetix: { addressResolver, susd },
      },
    },
    deployment: { synthetixPriceFeed },
  } = await provider.snapshot(snapshot);

  const exchangeRates = await synthetixResolveAddress({
    addressResolver,
    name: 'ExchangeRates',
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
