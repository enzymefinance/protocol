import { EthereumTestnetProvider } from '@crestproject/crestproject';
import { MockSynthetixAddressResolver, MockSynthetixExchangeRates } from '@melonproject/protocol';
import { defaultTestDeployment } from '@melonproject/testutils';
import { utils } from 'ethers';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(provider);

  return {
    accounts,
    deployment,
    config,
  };
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      config: {
        integratees: {
          synthetix: { addressResolver, susd },
        },
      },
      deployment: { synthetixPriceFeed },
    } = await provider.snapshot(snapshot);

    expect(await synthetixPriceFeed.getAddressResolver()).toMatchAddress(addressResolver);
    expect(await synthetixPriceFeed.getSUSD()).toMatchAddress(susd);
  });
});

describe('getRatesToUnderlyings', () => {
  it('revert on invalid rate', async () => {
    const {
      config: {
        deployer,
        integratees: {
          synthetix: { addressResolver, sbtc },
        },
      },
      deployment: { synthetixPriceFeed },
    } = await provider.snapshot(snapshot);

    const ar = new MockSynthetixAddressResolver(addressResolver, deployer);
    const exchangeRates = await ar.addresses(utils.formatBytes32String('ExchangeRates'));
    const er = new MockSynthetixExchangeRates(exchangeRates, deployer);

    await er.setRate(utils.formatBytes32String('sBTC'), '0');

    const getRatesToUnderlyings = synthetixPriceFeed.getRatesToUnderlyings.args(sbtc).call();

    await expect(getRatesToUnderlyings).rejects.toBeRevertedWith(
      'getRatesToUnderlyings: _derivative rate is not valid',
    );
  });

  it('returns valid rate', async () => {
    const {
      config: {
        deployer,
        integratees: {
          synthetix: { addressResolver, sbtc, susd },
        },
      },
      deployment: { synthetixPriceFeed },
    } = await provider.snapshot(snapshot);

    const ar = new MockSynthetixAddressResolver(addressResolver, deployer);
    const exchangeRates = await ar.addresses(utils.formatBytes32String('ExchangeRates'));
    const er = new MockSynthetixExchangeRates(exchangeRates, deployer);

    const sbtcRate = await er.rates(utils.formatBytes32String('sBTC'));
    const getRatesToUnderlyings = await synthetixPriceFeed.getRatesToUnderlyings.args(sbtc).call();

    expect(getRatesToUnderlyings).toMatchFunctionOutput(synthetixPriceFeed.getRatesToUnderlyings.fragment, {
      rates_: [sbtcRate],
      underlyings_: [susd],
    });
  });
});

describe('isSupportedAsset', () => {
  it('return false on invalid synth', async () => {
    const {
      deployment: {
        synthetixPriceFeed,
        tokens: { dai },
      },
    } = await provider.snapshot(snapshot);

    const isSupportedAsset = await synthetixPriceFeed.isSupportedAsset(dai);

    expect(isSupportedAsset).toBe(false);
  });

  it('returns true on valid synth', async () => {
    const {
      config: {
        integratees: {
          synthetix: { sbtc },
        },
      },
      deployment: { synthetixPriceFeed },
    } = await provider.snapshot(snapshot);

    const isSupportedAsset = await synthetixPriceFeed.isSupportedAsset(sbtc);

    expect(isSupportedAsset).toBe(true);
  });
});
