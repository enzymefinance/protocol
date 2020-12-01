import { EthereumTestnetProvider } from '@crestproject/crestproject';
import { IChainlinkAggregator } from '@melonproject/protocol';
import { calcGtr } from '@melonproject/protocol/src/utils/price-feeds/wdgld';
import { defaultForkDeployment } from '@melonproject/testutils';
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

describe('getRatesToUnderlyings', () => {
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

    const currentTimestamp = (await provider.getBlock('latest')).timestamp;
    const initialTimestamp = 1568700000;

    const wdgldToXauRate = await calcGtr({ currentTimestamp, initialTimestamp });
    const xauToWethRate = xauToUsdRate.mul(utils.parseUnits('1', 18)).div(ethToUsdRate);
    const rateToUnderlyings = await wdgldPriceFeed.getRatesToUnderlyings.args(wdgld).call();

    const expectedRates = wdgldToXauRate.mul(xauToWethRate).div(utils.parseUnits('1', 27));

    expect(rateToUnderlyings.rates_[0]).toEqBigNumber(expectedRates);
    expect(rateToUnderlyings.underlyings_[0]).toMatchAddress(weth);
  });

  it('returns the expected value from the valueInterpreter', async () => {
    const {
      deployment: { valueInterpreter },
      config: {
        tokens: { usdc },
        derivatives: { wdgld },
      },
    } = await provider.snapshot(snapshot);

    // XAU/USD price at 11/12/2020 had a rate of 1863 USD. Given an approximate GTR of 0.0988xx gives a value around 185 USD
    const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
      .args(wdgld, utils.parseUnits('1', 8), usdc)
      .call();

    expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
      value_: 185470188,
      isValid_: true,
    });
  });
});
