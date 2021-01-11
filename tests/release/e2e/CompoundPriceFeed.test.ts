import { EthereumTestnetProvider } from '@crestproject/crestproject';
import { ICERC20 } from '@enzymefinance/protocol';
import { defaultForkDeployment } from '@enzymefinance/testutils';
import { BigNumber, utils } from 'ethers';

const gasAssertionTolerance = 0.03; // 3%

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultForkDeployment(provider);

  return {
    accounts,
    deployment,
    config,
    cDai: new ICERC20(config.derivatives.compound.cdai, provider),
    cEth: new ICERC20(config.derivatives.compound.ceth, provider),
  };
}

describe('calcUnderlyingValues', () => {
  it('returns rate for underlying token (cERC20)', async () => {
    const {
      config: {
        tokens: { dai: token },
      },
      deployment: { compoundPriceFeed },
      cDai: cERC20,
    } = await provider.snapshot(snapshot);

    const cTokenUnit = utils.parseUnits('1', 6);
    const getRatesReceipt = await compoundPriceFeed.calcUnderlyingValues(cERC20, cTokenUnit);

    // cToken amount * stored rate / 10**18
    const expectedRate = cTokenUnit.mul(await cERC20.exchangeRateStored()).div(utils.parseEther('1'));

    const feedRate = await compoundPriceFeed.calcUnderlyingValues.args(cERC20, cTokenUnit).call();
    expect(feedRate.underlyingAmounts_[0]).toEqBigNumber(expectedRate);
    expect(feedRate.underlyings_[0]).toMatchAddress(token);

    // Rounding up from 38938
    expect(getRatesReceipt).toCostLessThan('39000', gasAssertionTolerance);
  });

  it('returns rate for underlying token (cETH)', async () => {
    const {
      config: {
        tokens: { weth: token },
      },
      deployment: { compoundPriceFeed },
      cEth,
    } = await provider.snapshot(snapshot);

    const cTokenUnit = utils.parseUnits('1', 6);
    const getRatesReceipt = await compoundPriceFeed.calcUnderlyingValues(cEth, cTokenUnit);

    // cToken amount * stored rate / 10**18
    const expectedRate = cTokenUnit.mul(await cEth.exchangeRateStored()).div(utils.parseEther('1'));

    const feedRate = await compoundPriceFeed.calcUnderlyingValues.args(cEth, cTokenUnit).call();
    expect(feedRate.underlyingAmounts_[0]).toEqBigNumber(expectedRate);
    expect(feedRate.underlyings_[0]).toMatchAddress(token);

    // Rounding up from 30991
    expect(getRatesReceipt).toCostLessThan('32000', gasAssertionTolerance);
  });
});

describe('expected values', () => {
  it('returns the expected value from the valueInterpreter (18 decimals)', async () => {
    const {
      deployment: { valueInterpreter },
      config: {
        deployer,
        tokens: { dai },
        derivatives: {
          compound: { cdai: cdaiAddress },
        },
      },
    } = await provider.snapshot(snapshot);

    const cdai = new ICERC20(cdaiAddress, deployer);

    const baseDecimals = await cdai.decimals();
    const quoteDecimals = await dai.decimals();
    expect(baseDecimals).toEqBigNumber(8);
    expect(quoteDecimals).toEqBigNumber(18);

    // cDai/usd price on Jan 9, 2021 was about 0,021 USD.
    // Source: <https://www.coingecko.com/en/coins/compound-dai/historical_data/usd?start_date=2021-01-09&end_date=2021-01-09>
    const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
      .args(cdai, utils.parseUnits('1', baseDecimals), dai)
      .call();
    expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
      value_: BigNumber.from('20917454883850009'),
      isValid_: true,
    });
  });

  it('returns the expected value from the valueInterpreter (non 18 decimals)', async () => {
    const {
      deployment: { valueInterpreter },
      config: {
        deployer,
        tokens: { usdc },
        derivatives: {
          compound: { cusdc: cusdcAddresses },
        },
      },
    } = await provider.snapshot(snapshot);

    const cusdc = new ICERC20(cusdcAddresses, deployer);

    const baseDecimals = await cusdc.decimals();
    const quoteDecimals = await usdc.decimals();
    expect(baseDecimals).toEqBigNumber(8);
    expect(quoteDecimals).toEqBigNumber(6);

    // cUsdc/usd price on Jan 9, 2021 was about 0,0213 USD.
    // source: https://www.coingecko.com/en/coins/compound-usd-coin/historical_data/usd?start_date=2021-01-09&end_date=2021-01-09>
    const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
      .args(cusdc, utils.parseUnits('1', baseDecimals), usdc)
      .call();
    expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
      value_: BigNumber.from('21416'),
      isValid_: true,
    });
  });
});
