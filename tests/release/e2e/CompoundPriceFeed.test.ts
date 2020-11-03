import { EthereumTestnetProvider } from '@crestproject/crestproject';
import { ICERC20 } from '@melonproject/protocol';
import { defaultForkDeployment } from '@melonproject/testutils';

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

describe('getRatesToUnderlyings', () => {
  it('returns rate for underlying token (cERC20)', async () => {
    const {
      config: {
        tokens: { dai: token },
      },
      deployment: { compoundPriceFeed },
      cDai: cERC20,
    } = await provider.snapshot(snapshot);

    const getRatesReceipt = await compoundPriceFeed.getRatesToUnderlyings(cERC20);

    // exchangeRate (base 1e18) = (totalCash + totalBorrows - totalReserves) / totalSupply
    const expectedRate = await cERC20.exchangeRateStored();
    const feedRate = await compoundPriceFeed.getRatesToUnderlyings.args(cERC20).call();

    expect(feedRate.rates_[0]).toEqBigNumber(expectedRate);
    expect(feedRate.underlyings_[0]).toMatchAddress(token);

    // Rounding up from 42295
    expect(getRatesReceipt).toCostLessThan('42300');
  });

  it('returns rate for underlying token (cETH)', async () => {
    const {
      config: {
        tokens: { weth: token },
      },
      deployment: { compoundPriceFeed },
      cEth,
    } = await provider.snapshot(snapshot);

    const getRatesReceipt = await compoundPriceFeed.getRatesToUnderlyings(cEth);

    const expectedRate = await cEth.exchangeRateStored();
    const feedRate = await compoundPriceFeed.getRatesToUnderlyings.args(cEth).call();

    expect(feedRate.rates_[0]).toEqBigNumber(expectedRate);
    expect(feedRate.underlyings_[0]).toMatchAddress(token);

    // Rounding up from 30991
    expect(getRatesReceipt).toCostLessThan('31000');
  });
});
