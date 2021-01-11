import { EthereumTestnetProvider } from '@crestproject/crestproject';
import { ISynthetixExchangeRates, StandardToken } from '@enzymefinance/protocol';
import { defaultForkDeployment, synthetixResolveAddress } from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

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

describe('expected values', () => {
  it('returns the expected value from the valueInterpreter (18 decimals quote)', async () => {
    const {
      deployment: { valueInterpreter },
      config: {
        derivatives: {
          synthetix: { sbtc: sbtcAddress },
        },
        deployer,
        tokens: { dai },
      },
    } = await provider.snapshot(snapshot);

    const sbtc = new StandardToken(sbtcAddress, deployer);
    const baseDecimals = await sbtc.decimals();
    const quoteDecimals = await dai.decimals();

    expect(baseDecimals).toEqBigNumber(18);
    expect(quoteDecimals).toEqBigNumber(18);

    // sbtc/usd price at Jan 9, 2020 had a price of $41,000
    // Source: <https://www.coingecko.com/en/coins/sbtc/historical_data/usd?start_date=2021-01-09&end_date=2021-01-09#panel>

    const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
      .args(sbtc, utils.parseUnits('1', baseDecimals), dai)
      .call();

    expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
      value_: BigNumber.from('41202889991809591335281'),
      isValid_: true,
    });
  });

  it('returns the expected value from the valueInterpreter (non 18 decimals quote)', async () => {
    const {
      deployment: { valueInterpreter },
      config: {
        derivatives: {
          synthetix: { sbtc: sbtcAddress },
        },
        deployer,
        tokens: { usdc },
      },
    } = await provider.snapshot(snapshot);

    const sbtc = new StandardToken(sbtcAddress, deployer);
    const baseDecimals = await sbtc.decimals();
    const quoteDecimals = await usdc.decimals();

    expect(baseDecimals).toEqBigNumber(18);
    expect(quoteDecimals).toEqBigNumber(6);

    // sbtc/usd price at Jan 9, 2020 had a price of $41,000
    // Source: <https://www.coingecko.com/en/coins/sbtc/historical_data/usd?start_date=2021-01-09&end_date=2021-01-09#panel>

    const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
      .args(sbtc, utils.parseUnits('1', baseDecimals), usdc)
      .call();

    expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
      value_: BigNumber.from('41292277629'),
      isValid_: true,
    });
  });
});
