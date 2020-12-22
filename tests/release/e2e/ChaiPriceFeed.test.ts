import { EthereumTestnetProvider } from '@crestproject/crestproject';
import { IMakerDaoPot, StandardToken } from '@melonproject/protocol';
import { defaultForkDeployment } from '@melonproject/testutils';
import { BigNumber, utils } from 'ethers';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultForkDeployment(provider);

  return {
    accounts,
    deployment,
    config,
  };
}

describe('getRatesToUnderlyings', () => {
  it('returns rate for underlying token dai', async () => {
    const {
      config: {
        deployer,
        derivatives: { chai },
        integratees: {
          makerDao: { pot: potAddress },
        },
        tokens: { dai },
      },
      deployment: { chaiPriceFeed },
    } = await provider.snapshot(snapshot);

    const pot = new IMakerDaoPot(potAddress, deployer);
    const chi = await pot.chi();

    const chaiGetPriceFeedReceipt = await chaiPriceFeed.getRatesToUnderlyings.args(chai).call();

    expect(chaiGetPriceFeedReceipt).toMatchFunctionOutput(chaiPriceFeed.getRatesToUnderlyings, {
      rates_: [chi.div(10 ** 9)],
      underlyings_: [dai],
    });
  });
});

describe('expected values', () => {
  it('returns the expected value from the valueInterpreter (18 decimals)', async () => {
    const {
      deployment: { valueInterpreter },
      config: {
        deployer,
        derivatives: { chai: chaiAddress },
        tokens: { dai },
      },
    } = await provider.snapshot(snapshot);
    const chai = new StandardToken(chaiAddress, deployer);
    const baseDecimals = await chai.decimals();
    const quoteDecimals = await dai.decimals();

    expect(baseDecimals).toEqBigNumber(18);
    expect(quoteDecimals).toEqBigNumber(18);

    // chai/usd price on 11/12/2020 was rated at $1.08.
    // Source: <https://www.coingecko.com/en/coins/chai/historical_data/usd?start_date=2020-11-12&end_date=2020-11-13#panel>

    const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
      .args(chai, utils.parseUnits('1', baseDecimals), dai)
      .call();

    expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
      value_: BigNumber.from('1018008449363110619'),
      isValid_: true,
    });
  });
});
