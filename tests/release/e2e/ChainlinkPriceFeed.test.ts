import { EthereumTestnetProvider, randomAddress } from '@crestproject/crestproject';
import { IChainlinkAggregator, MockToken } from '@melonproject/protocol';
import { defaultForkDeployment } from '@melonproject/testutils';
import { BigNumber, constants, utils } from 'ethers';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultForkDeployment(provider);

  const renAggregatorAddress = (await deployment.chainlinkPriceFeed.getAggregatorInfoForPrimitive(config.tokens.ren))
    .aggregator;
  const usdcAggregatorAddress = (await deployment.chainlinkPriceFeed.getAggregatorInfoForPrimitive(config.tokens.usdc))
    .aggregator;
  const ethUSDAggregatorAddress = await deployment.chainlinkPriceFeed.getEthUsdAggregator();

  const renAggregator = new IChainlinkAggregator(renAggregatorAddress, config.deployer);
  const usdcAggregator = new IChainlinkAggregator(usdcAggregatorAddress, config.deployer);
  const ethUSDAggregator = new IChainlinkAggregator(ethUSDAggregatorAddress, config.deployer);

  // Deregister DAI and re-add it to use the DAI/USD aggregator.
  // This makes conversions simple by using stablecoins on both sides of the conversion,
  // which should always be nearly 1:1
  // See https://docs.chain.link/docs/using-chainlink-reference-contracts
  await deployment.chainlinkPriceFeed.removePrimitives([config.tokens.dai]);
  const daiAggregator = new IChainlinkAggregator('0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9', config.deployer);
  await deployment.chainlinkPriceFeed.addPrimitives([config.tokens.dai], [daiAggregator], [1]);

  // Create a mock token and unused aggregator for additional aggregator CRUD tests
  const unregisteredMockToken = await MockToken.deploy(config.deployer, 'Mock Token', 'MOCK', 6);
  // Unused chf/usd aggregator, taken from
  const unusedAggregator = new IChainlinkAggregator('0x449d117117838fFA61263B61dA6301AA2a88B13A', config.deployer);

  return {
    accounts,
    deployment,
    aggregators: { daiAggregator, renAggregator, ethUSDAggregator, usdcAggregator },
    config,
    unregisteredMockToken,
    unusedAggregator,
  };
}

describe('getCanonicalRate', () => {
  // USDC/ETH and WETH/ETH
  it('works as expected when calling getCanonicalRate (equal rate asset)', async () => {
    const {
      deployment: { chainlinkPriceFeed },
      config: {
        tokens: { usdc, weth },
      },
      aggregators: { usdcAggregator },
    } = await provider.snapshot(snapshot);

    // Get asset units
    const wethUnit = utils.parseEther('1');
    const usdcUnit = utils.parseUnits('1', await usdc.decimals());

    // Get rates
    const ethRate = utils.parseEther('1');
    const usdcRate = await usdcAggregator.latestAnswer();

    // Base: weth |  Quote: usdc
    const expectedRate = wethUnit.mul(ethRate).div(wethUnit).mul(usdcUnit).div(usdcRate);
    const rate = await chainlinkPriceFeed.calcCanonicalValue(weth, wethUnit, usdc);
    expect(rate).toMatchFunctionOutput(chainlinkPriceFeed.calcCanonicalValue, {
      quoteAssetAmount_: expectedRate,
      isValid_: true,
    });
  });

  // DAI/USD and USDC/ETH
  it('works as expected when calling getCanonicalRate (different rate assets)', async () => {
    const {
      deployment: { chainlinkPriceFeed },
      config: {
        tokens: { dai, usdc },
      },
      aggregators: { daiAggregator, usdcAggregator, ethUSDAggregator },
    } = await provider.snapshot(snapshot);

    // Get asset units
    const ethUnit = utils.parseEther('1');
    const daiUnit = utils.parseUnits('1', await dai.decimals());
    const usdcUnit = utils.parseUnits('1', await usdc.decimals());

    // Calculate Rates
    const ethRate = await ethUSDAggregator.latestAnswer();
    const usdcRate = await usdcAggregator.latestAnswer();
    const daiRate = await daiAggregator.latestAnswer();

    // USD rate to ETH rate
    // Base: dai |  Quote: usdc
    const expectedRateDaiUsdc = daiUnit.mul(daiRate).mul(usdcUnit).div(ethRate).mul(ethUnit).div(daiUnit).div(usdcRate);
    const canonicalRateDaiUsdc = await chainlinkPriceFeed.calcCanonicalValue(dai, daiUnit, usdc);

    expect(canonicalRateDaiUsdc).toMatchFunctionOutput(chainlinkPriceFeed.calcCanonicalValue, {
      quoteAssetAmount_: expectedRateDaiUsdc,
      isValid_: true,
    });

    // ETH rate to USD rate
    // Base: usdc, quote: dai
    const expectedRateUsdcDai = usdcUnit
      .mul(usdcRate)
      .mul(ethRate)
      .div(ethUnit)
      .mul(daiUnit)
      .div(usdcUnit)
      .div(daiRate);
    const canonicalRateUsdcDai = await chainlinkPriceFeed.calcCanonicalValue(usdc, usdcUnit, dai);
    expect(canonicalRateUsdcDai).toMatchFunctionOutput(chainlinkPriceFeed.calcCanonicalValue, {
      quoteAssetAmount_: expectedRateUsdcDai,
      isValid_: true,
    });
  });
});

describe('addPrimitives', () => {
  it('works as expected when adding a primitive', async () => {
    const {
      deployment: { chainlinkPriceFeed },
      unregisteredMockToken,
      unusedAggregator,
    } = await provider.snapshot(snapshot);

    // Register the unregistered primitive with the unused aggregator
    await chainlinkPriceFeed.addPrimitives([unregisteredMockToken], [unusedAggregator], [0]);

    const info = await chainlinkPriceFeed.getAggregatorInfoForPrimitive(unregisteredMockToken);
    expect(info).toMatchFunctionOutput(chainlinkPriceFeed.getAggregatorInfoForPrimitive, {
      aggregator: unusedAggregator,
      rateAsset: 0,
    });
    expect(await chainlinkPriceFeed.getUnitForPrimitive(unregisteredMockToken)).toEqBigNumber(
      utils.parseUnits('1', await unregisteredMockToken.decimals()),
    );
  });

  it('works as expected when adding a wrong primitive', async () => {
    const {
      deployment: { chainlinkPriceFeed },
      config: {
        tokens: { usdc },
      },
      aggregators: { renAggregator },
    } = await provider.snapshot(snapshot);

    // Adds a primitive with an invalid rate asset
    await expect(chainlinkPriceFeed.addPrimitives([usdc], [renAggregator], [2])).rejects.toBeReverted();

    // Adds a random aggregator (non aggregator contract)
    await expect(chainlinkPriceFeed.addPrimitives([usdc], [randomAddress()], [1])).rejects.toBeReverted();
  });
});

describe('updatePrimitives', () => {
  it('works as expected when updating a primitive', async () => {
    const {
      config: {
        tokens: { dai },
      },
      deployment: { chainlinkPriceFeed },
      unusedAggregator,
    } = await provider.snapshot(snapshot);

    // Update dai to use the unused aggregator
    await chainlinkPriceFeed.updatePrimitives([dai], [unusedAggregator]);

    const info = await chainlinkPriceFeed.getAggregatorInfoForPrimitive(dai);
    expect(info).toMatchFunctionOutput(chainlinkPriceFeed.getAggregatorInfoForPrimitive, {
      aggregator: unusedAggregator,
      rateAsset: 0,
    });
  });
});

describe('removePrimitives', () => {
  it('works as expected when removing a primitive', async () => {
    const {
      deployment: { chainlinkPriceFeed },
      config: {
        tokens: { dai },
      },
    } = await provider.snapshot(snapshot);

    await chainlinkPriceFeed.removePrimitives([dai]);

    const info = await chainlinkPriceFeed.getAggregatorInfoForPrimitive(dai);
    expect(info).toMatchFunctionOutput(chainlinkPriceFeed.getAggregatorInfoForPrimitive, {
      aggregator: constants.AddressZero,
      rateAsset: 0,
    });
  });
});

describe('removeStalePrimitives', () => {
  it('allows removing a stale primitive based on the timestamp', async () => {
    const {
      accounts: [randomUser],
      deployment: { chainlinkPriceFeed },
      config: {
        tokens: { dai },
      },
    } = await provider.snapshot(snapshot);

    // Should fail initially because the rate is not stale
    await expect(chainlinkPriceFeed.connect(randomUser).removeStalePrimitives([dai])).rejects.toBeRevertedWith(
      'Rate is not stale',
    );

    // Should succeed after warping beyond staleness threshold
    await provider.send('evm_increaseTime', [60 * 60 * 49]);
    await expect(chainlinkPriceFeed.connect(randomUser).removeStalePrimitives([dai])).resolves.toBeReceipt();
  });
});

fdescribe('expected values', () => {
  describe('similar rate asset (ETH)', () => {
    // USDC/ETH and USDT/ETH
    it('returns the expected value from the valueInterpreter (same decimals)', async () => {
      const {
        deployment: { valueInterpreter },
        config: {
          tokens: { usdc, usdt },
        },
      } = await provider.snapshot(snapshot);

      const baseDecimals = await usdc.decimals();
      const quoteDecimals = await usdt.decimals();
      expect(baseDecimals).toEqBigNumber(quoteDecimals);

      const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
        .args(usdc, utils.parseUnits('1', baseDecimals), usdt)
        .call();

      // Should be near 1000000 (10^6)
      expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
        value_: BigNumber.from('1002578'),
        isValid_: true,
      });
    });

    // SUSD/ETH and USDC/ETH
    it('returns the expected value from the valueInterpreter (different decimals)', async () => {
      const {
        deployment: { valueInterpreter },
        config: {
          tokens: { susd, usdc },
        },
      } = await provider.snapshot(snapshot);

      const baseDecimals = await susd.decimals();
      const quoteDecimals = await usdc.decimals();
      expect(baseDecimals).not.toEqBigNumber(quoteDecimals);

      // dai/usd value should always be similar

      const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
        .args(susd, utils.parseUnits('1', baseDecimals), usdc)
        .call();

      // Should be near 1000000 (10^6)
      expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
        value_: BigNumber.from('998579'),
        isValid_: true,
      });
    });
  });

  describe('similar rate asset (USD)', () => {
    it.todo('returns the expected value from the valueInterpreter (non 18 decimals)');

    // BNB/USD and REN/USD
    it('returns the expected value from the valueInterpreter (18 decimals)', async () => {
      const {
        deployment: { valueInterpreter },
        config: {
          tokens: { bnb, ren },
        },
      } = await provider.snapshot(snapshot);

      const baseDecimals = await bnb.decimals();
      const quoteDecimals = await ren.decimals();
      expect(baseDecimals).toEqBigNumber(quoteDecimals);

      // bnb/usd on Jan 9, 2021 was about $43
      // ren/usd on Jan 9, 2021 was about $0.42
      // Source (bnb): <https://www.coingecko.com/en/coins/binance-coin/historical_data/usd?start_date=2021-01-09&end_date=2021-01-09>
      // Source (ren): <https://www.coingecko.com/en/coins/ren/historical_data/usd?start_date=2021-01-09&end_date=2021-01-09>
      // 1 bnb was about 100 REN

      const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
        .args(bnb, utils.parseUnits('1', baseDecimals), ren)
        .call();

      expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
        value_: BigNumber.from('99151115443056596491'),
        isValid_: true,
      });
    });
  });

  describe('different rate asset (ETH rate -> USD rate)', () => {
    // SUSD/ETH and DAI/USD
    it('returns the expected value from the valueInterpreter (same decimals)', async () => {
      const {
        deployment: { valueInterpreter },
        config: {
          tokens: { susd, dai },
        },
      } = await provider.snapshot(snapshot);

      const baseDecimals = await susd.decimals();
      const quoteDecimals = await dai.decimals();
      expect(baseDecimals).toEqBigNumber(quoteDecimals);

      const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
        .args(susd, utils.parseUnits('1', baseDecimals), dai)
        .call();

      // Should be near 1000000000000000000 (10^18)
      expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
        value_: BigNumber.from('1003149599956634518'),
        isValid_: true,
      });
    });

    // USDC/ETH and DAI/USD
    it('returns the expected value from the valueInterpreter (non 18 decimals primitives)', async () => {
      const {
        deployment: { valueInterpreter },
        config: {
          tokens: { dai, usdc },
        },
      } = await provider.snapshot(snapshot);

      const baseDecimals = await usdc.decimals();
      const quoteDecimals = await dai.decimals();
      expect(baseDecimals).not.toEqBigNumber(quoteDecimals);

      const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
        .args(usdc, utils.parseUnits('1', baseDecimals), dai)
        .call();

      // Should be near 1000000000000000000 (10^18)
      expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
        value_: BigNumber.from('1004576194116943606'),
        isValid_: true,
      });
    });
  });

  describe('different rate asset (USD rate -> ETH rate)', () => {
    // DAI/USD and SUSD/ETH
    it('returns the expected value from the valueInterpreter (18 decimals)', async () => {
      const {
        deployment: { valueInterpreter },
        config: {
          tokens: { dai, susd },
        },
      } = await provider.snapshot(snapshot);

      const baseDecimals = await dai.decimals();
      const quoteDecimals = await susd.decimals();
      expect(baseDecimals).toEqBigNumber(quoteDecimals);

      const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
        .args(dai, utils.parseUnits('1', baseDecimals), susd)
        .call();

      // Should be near 1000000000000000000 (10^18)
      expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
        value_: BigNumber.from('996860288877381126'),
        isValid_: true,
      });
    });

    // DAI/USD and USDC/ETH
    it('returns the expected value from the valueInterpreter (non 18 decimals primitives)', async () => {
      const {
        deployment: { valueInterpreter },
        config: {
          tokens: { dai, usdc },
        },
      } = await provider.snapshot(snapshot);

      const baseDecimals = await dai.decimals();
      const quoteDecimals = await usdc.decimals();
      expect(baseDecimals).not.toEqBigNumber(quoteDecimals);

      const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
        .args(dai, utils.parseUnits('1', baseDecimals), usdc)
        .call();

      // Should be near 1000000 (10^6)
      expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
        value_: BigNumber.from('995444'),
        isValid_: true,
      });
    });
  });
});
