import { EthereumTestnetProvider } from '@crestproject/crestproject';
import { IChainlinkAggregator } from '@enzymefinance/protocol';
import { defaultForkDeployment } from '@enzymefinance/testutils';
import { utils } from 'ethers';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultForkDeployment(provider);

  const xauAggregator = new IChainlinkAggregator(config.chainlink.xauUsdAggregator, config.deployer);
  const ethUSDAggregator = new IChainlinkAggregator(config.chainlink.ethUsdAggregator, config.deployer);

  return {
    accounts,
    deployment,
    aggregators: { xauAggregator, ethUSDAggregator },
    config,
  };
}

describe('calcUnderlyingValues', () => {
  it('returns rate for underlying token weth', async () => {
    const {
      config: {
        tokens: { weth },
        derivatives: { wdgld },
      },
      deployment: { wdgldPriceFeed },
      aggregators: { xauAggregator, ethUSDAggregator },
    } = await provider.snapshot(snapshot);

    const xauToUsdRate = await xauAggregator.latestAnswer();
    const ethToUsdRate = await ethUSDAggregator.latestAnswer();

    const wdgldToXauRate = await wdgldPriceFeed.calcWdgldToXauRate();

    const wdgldUnit = utils.parseUnits('1', 8);

    const underlyingValues = await wdgldPriceFeed.calcUnderlyingValues.args(wdgld, wdgldUnit).call();
    // 10**17 is a combination of ETH_UNIT / WDGLD_UNIT * GTR_PRECISION
    const expectedAmount = wdgldUnit
      .mul(wdgldToXauRate)
      .mul(xauToUsdRate)
      .div(ethToUsdRate)
      .div(utils.parseUnits('1', 17));

    expect(underlyingValues.underlyings_[0]).toMatchAddress(weth);
    expect(underlyingValues.underlyingAmounts_[0]).toEqBigNumber(expectedAmount);
  });

  it('returns the expected value from the valueInterpreter', async () => {
    const {
      deployment: { valueInterpreter },
      config: {
        tokens: { usdc },
        derivatives: { wdgld },
      },
    } = await provider.snapshot(snapshot);

    // XAU/USD price at Jan 6, 2021 had a rate of 1849 USD. Given an approximate GTR of 0.0988xx gives a value around 182 USD
    const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
      .args(wdgld, utils.parseUnits('1', 8), usdc)
      .call();

    expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
      value_: 180904956,
      isValid_: true,
    });
  });
});
