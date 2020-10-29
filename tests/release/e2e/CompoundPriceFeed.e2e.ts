import {
  EthereumTestnetProvider,
  resolveAddress,
} from '@crestproject/crestproject';
import { ICERC20 } from '@melonproject/protocol';
import { defaultForkDeployment } from '@melonproject/testutils';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultForkDeployment(
    provider,
  );

  return {
    accounts,
    deployment,
    config,
    derivatives: {
      cdai: new ICERC20(
        await resolveAddress(config.derivatives.compound.cdai),
        provider,
      ),
      ceth: new ICERC20(
        await resolveAddress(config.derivatives.compound.ceth),
        provider,
      ),
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

    await compoundPriceFeed.getRatesToUnderlyings(cToken.address);

    // exchangeRate (base 1e18) = (totalCash + totalBorrows - totalReserves) / totalSupply
    const expectedRate = await cToken.exchangeRateStored();

    const feedRate = await compoundPriceFeed.getRatesToUnderlyings
      .args(cToken.address)
      .call();
    expect(feedRate.rates_[0]).toEqBigNumber(expectedRate);
    expect(feedRate.underlyings_[0]).toBe(await resolveAddress(token));
  });

  it('returns rate for underlying token (ETH)', async () => {
    const {
      derivatives: { ceth: cToken },
      config: {
        tokens: { weth: token },
      },
      deployment: { compoundPriceFeed },
    } = await provider.snapshot(snapshot);

    await compoundPriceFeed.getRatesToUnderlyings(cToken.address);

    const expectedRate = await cToken.exchangeRateStored();
    const feedRate = await compoundPriceFeed.getRatesToUnderlyings
      .args(await resolveAddress(cToken))
      .call();
    expect(feedRate.rates_[0]).toEqBigNumber(expectedRate);
    expect(feedRate.underlyings_[0]).toBe(await resolveAddress(token));
  });
});
