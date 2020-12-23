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

  const synthUnit = utils.parseEther('1');

  const synthetixExchangeRate = new ISynthetixExchangeRates(exchangeRates, deployer);
  await synthetixPriceFeed.calcUnderlyingValues(sbtc, synthUnit);

  // Synthetix rates
  const { '0': expectedRate } = await synthetixExchangeRate.rateAndInvalid(utils.formatBytes32String('sBTC'));
  const expectedAmount = synthUnit.mul(expectedRate).div(synthUnit); // i.e., just expectedRate

  // Internal feed rates
  const feedRate = await synthetixPriceFeed.calcUnderlyingValues.args(sbtc, synthUnit).call();
  expect(feedRate).toMatchFunctionOutput(synthetixPriceFeed.calcUnderlyingValues.fragment, {
    underlyingAmounts_: [expectedAmount],
    underlyings_: [susd],
  });
});
