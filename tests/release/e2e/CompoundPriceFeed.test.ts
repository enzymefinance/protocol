import { EthereumTestnetProvider } from '@crestproject/crestproject';
import { ICERC20 } from '@melonproject/protocol';
import { defaultForkDeployment } from '@melonproject/testutils';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultForkDeployment(provider);

  return {
    accounts,
    deployment,
    config,
    derivatives: {
      cdai: new ICERC20(config.derivatives.compound.cdai, provider),
      ceth: new ICERC20(config.derivatives.compound.ceth, provider),
    },
  };
}

describe('getRatesToUnderlyings', () => {
  it('returns rate for underlying token', async () => {
    const {
      derivatives: { cdai: cToken },
      config: {
        tokens: { dai: token },
      },
      deployment: { compoundPriceFeed },
    } = await provider.snapshot(snapshot);

    await compoundPriceFeed.getRatesToUnderlyings(cToken);

    // exchangeRate (base 1e18) = (totalCash + totalBorrows - totalReserves) / totalSupply
    const expectedRate = await cToken.exchangeRateStored();
    const feedRate = await compoundPriceFeed.getRatesToUnderlyings.args(cToken).call();

    expect(feedRate.rates_[0]).toEqBigNumber(expectedRate);
    expect(feedRate.underlyings_[0]).toMatchAddress(token);
  });

  it('returns rate for underlying token (ETH)', async () => {
    const {
      derivatives: { ceth: cToken },
      config: {
        tokens: { weth: token },
      },
      deployment: { compoundPriceFeed },
    } = await provider.snapshot(snapshot);

    await compoundPriceFeed.getRatesToUnderlyings(cToken);

    const expectedRate = await cToken.exchangeRateStored();
    const feedRate = await compoundPriceFeed.getRatesToUnderlyings.args(cToken).call();

    expect(feedRate.rates_[0]).toEqBigNumber(expectedRate);
    expect(feedRate.underlyings_[0]).toMatchAddress(token);
  });
});
