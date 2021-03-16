import { ISynthetixAddressResolver, ISynthetixExchangeRates, StandardToken } from '@enzymefinance/protocol';
import { ProtocolDeployment, deployProtocolFixture, synthetixResolveAddress } from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

it('returns rate for underlying token', async () => {
  const synthetixPriceFeed = fork.deployment.synthetixPriceFeed;
  const sbtc = new StandardToken(fork.config.synthetix.synths.sbtc, provider);
  const susd = new StandardToken(fork.config.primitives.susd, provider);

  const exchangeRates = await synthetixResolveAddress({
    addressResolver: new ISynthetixAddressResolver(fork.config.synthetix.addressResolver, provider),
    name: 'ExchangeRates',
  });

  const synthUnit = utils.parseEther('1');

  const synthetixExchangeRate = new ISynthetixExchangeRates(exchangeRates, provider);
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
    const valueInterpreter = fork.deployment.valueInterpreter;
    const sbtc = new StandardToken(fork.config.synthetix.synths.sbtc, provider);
    const dai = new StandardToken(fork.config.primitives.dai, provider);

    const baseDecimals = await sbtc.decimals();
    const quoteDecimals = await dai.decimals();

    expect(baseDecimals).toEqBigNumber(18);
    expect(quoteDecimals).toEqBigNumber(18);

    // sbtc/usd price at Jan 17, 2020 had a price of $36,500
    // Source: <https://www.coingecko.com/en/coins/sbtc/historical_data/usd?start_date=2021-01-17&end_date=2021-01-17#panel>

    const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
      .args(sbtc, utils.parseUnits('1', baseDecimals), dai)
      .call();

    expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
      isValid_: true,
      value_: BigNumber.from('36520318115419358123009'),
    });
  });

  it('returns the expected value from the valueInterpreter (non 18 decimals quote)', async () => {
    const valueInterpreter = fork.deployment.valueInterpreter;
    const sbtc = new StandardToken(fork.config.synthetix.synths.sbtc, provider);
    const usdc = new StandardToken(fork.config.primitives.usdc, provider);

    const baseDecimals = await sbtc.decimals();
    const quoteDecimals = await usdc.decimals();

    expect(baseDecimals).toEqBigNumber(18);
    expect(quoteDecimals).toEqBigNumber(6);

    // sbtc/usd price at Jan 17, 2020 had a price of $36,500
    // Source: <https://www.coingecko.com/en/coins/sbtc/historical_data/usd?start_date=2021-01-17&end_date=2021-01-17#panel>

    const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
      .args(sbtc, utils.parseUnits('1', baseDecimals), usdc)
      .call();

    expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
      value_: BigNumber.from('36777302447'),
      isValid_: true,
    });
  });
});
