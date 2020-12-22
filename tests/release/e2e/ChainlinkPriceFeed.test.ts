import { EthereumTestnetProvider, randomAddress } from '@crestproject/crestproject';
import { IChainlinkAggregator } from '@melonproject/protocol';
import { defaultForkDeployment } from '@melonproject/testutils';
import { BigNumber, constants, utils } from 'ethers';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultForkDeployment(provider);

  const daiAggregatorAddress = await (
    await deployment.chainlinkPriceFeed.getAggregatorInfoForPrimitive(config.tokens.dai)
  ).aggregator;
  const renAggregatorAddress = await (
    await deployment.chainlinkPriceFeed.getAggregatorInfoForPrimitive(config.tokens.ren)
  ).aggregator;
  const ethUSDAggregatorAddress = await deployment.chainlinkPriceFeed.getEthUsdAggregator();

  const daiAggregator = new IChainlinkAggregator(daiAggregatorAddress, config.deployer);
  const renAggregator = new IChainlinkAggregator(renAggregatorAddress, config.deployer);
  const ethUSDAggregator = new IChainlinkAggregator(ethUSDAggregatorAddress, config.deployer);

  return {
    accounts,
    deployment,
    aggregators: { daiAggregator, renAggregator, ethUSDAggregator },
    config,
  };
}

describe('getCanonicalRate', () => {
  it('works as expected when calling getCanonicalRate (equal rate asset)', async () => {
    const {
      deployment: { chainlinkPriceFeed },
      config: {
        tokens: { dai, weth },
      },
      aggregators: { daiAggregator },
    } = await provider.snapshot(snapshot);

    const ethRate = utils.parseEther('1');
    const daiRate = await daiAggregator.latestAnswer();

    const expectedRate = ethRate.mul(utils.parseEther('1')).div(daiRate);

    // Base: weth |  Quote: dai
    const rate = await chainlinkPriceFeed.getCanonicalRate(weth, dai);
    expect(rate).toMatchFunctionOutput(chainlinkPriceFeed.getCanonicalRate, {
      rate_: expectedRate,
      isValid_: true,
    });
  });

  it('works as expected when calling getCanonicalRate (different rate assets)', async () => {
    const {
      deployment: { chainlinkPriceFeed },
      config: {
        tokens: { dai, ren },
      },
      aggregators: { daiAggregator, renAggregator, ethUSDAggregator },
    } = await provider.snapshot(snapshot);

    // Calculate Rates
    const ethRate = await ethUSDAggregator.latestAnswer();
    const renRate = await renAggregator.latestAnswer();
    const daiRate = await daiAggregator.latestAnswer();

    // Calculate rate to match (ren/dai) * precision
    const expectedRateRenDai = renRate.mul(utils.parseEther('1')).mul(utils.parseEther('1')).div(ethRate).div(daiRate);

    // Base: ren |  Quote: dai
    const canonicalRateRenDai = await chainlinkPriceFeed.getCanonicalRate(ren, dai);
    expect(canonicalRateRenDai).toMatchFunctionOutput(chainlinkPriceFeed.getCanonicalRate, {
      rate_: expectedRateRenDai,
      isValid_: true,
    });

    // Calculate rate to match (dai/ren) * precision
    const expectedRateDaiRen = daiRate.mul(ethRate).div(renRate);

    // Base: dai, quote: ren
    const canonicalRateDaiRen = await chainlinkPriceFeed.getCanonicalRate(dai, ren);
    expect(canonicalRateDaiRen).toMatchFunctionOutput(chainlinkPriceFeed.getCanonicalRate, {
      rate_: expectedRateDaiRen,
      isValid_: true,
    });
  });
});

describe('addPrimitives', () => {
  it('works as expected when adding a primitive', async () => {
    const {
      deployment: { chainlinkPriceFeed },
      config: {
        deployer,
        tokens: { usdc },
      },
    } = await provider.snapshot(snapshot);

    // Unadded usdc aggregator, taken from https://docs.chain.link/docs/using-chainlink-reference-contracts
    const usdcAggregatorAddress = '0x986b5E1e1755e3C2440e960477f25201B0a8bbD4';
    const usdcAggregator = new IChainlinkAggregator(usdcAggregatorAddress, deployer);

    await chainlinkPriceFeed.addPrimitives([usdc], [usdcAggregator], [0]);

    const info = await chainlinkPriceFeed.getAggregatorInfoForPrimitive(usdc);
    expect(info).toMatchFunctionOutput(chainlinkPriceFeed.getAggregatorInfoForPrimitive, {
      aggregator: usdcAggregator,
      rateAsset: 0,
    });
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
      deployment: { chainlinkPriceFeed },
      aggregators: { daiAggregator, renAggregator },
    } = await provider.snapshot(snapshot);

    const newPrimitive = randomAddress();
    await chainlinkPriceFeed.addPrimitives([newPrimitive], [daiAggregator], [0]);

    await chainlinkPriceFeed.updatePrimitives([newPrimitive], [renAggregator]);

    const info = await chainlinkPriceFeed.getAggregatorInfoForPrimitive(newPrimitive);
    expect(info).toMatchFunctionOutput(chainlinkPriceFeed.getAggregatorInfoForPrimitive, {
      aggregator: renAggregator,
      rateAsset: 0,
    });
  });

  it('works as expected when updating a wrong primitive', async () => {
    const {
      deployment: { chainlinkPriceFeed },
      aggregators: { daiAggregator, renAggregator },
    } = await provider.snapshot(snapshot);

    // Update a non added primitive with a wrong rate asset
    await expect(chainlinkPriceFeed.updatePrimitives([randomAddress()], [renAggregator])).rejects.toBeReverted();

    const newPrimitive = randomAddress();

    // Update primitive with a random aggregator (non aggregator contract)
    await chainlinkPriceFeed.addPrimitives([newPrimitive], [daiAggregator], [0]);
    expect(chainlinkPriceFeed.addPrimitives([newPrimitive], [randomAddress()], [1])).rejects.toBeReverted();
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

describe('expected values', () => {
  describe('similar rate asset (ETH)', () => {
    it('returns the expected value from the valueInterpreter (18 decimals)', async () => {
      const {
        deployment: { valueInterpreter },
        config: {
          tokens: { dai, susd },
        },
      } = await provider.snapshot(snapshot);

      const baseDecimals = await dai.decimals();
      const quoteDecimals = await susd.decimals();

      expect(baseDecimals).toEqBigNumber(18);
      expect(quoteDecimals).toEqBigNumber(18);

      // susd/usd value should always be similar

      const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
        .args(dai, utils.parseUnits('1', baseDecimals), susd)
        .call();

      expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
        value_: BigNumber.from('1017353959404129420'),
        isValid_: true,
      });
    });

    it('returns the expected value from the valueInterpreter (non 18 decimals)', async () => {
      const {
        deployment: { valueInterpreter },
        config: {
          tokens: { dai, usdc },
        },
      } = await provider.snapshot(snapshot);

      const baseDecimals = await dai.decimals();
      const quoteDecimals = await usdc.decimals();

      expect(baseDecimals).toEqBigNumber(18);
      expect(quoteDecimals).toEqBigNumber(6);

      // dai/usd value should always be similar

      const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
        .args(dai, utils.parseUnits('1', baseDecimals), usdc)
        .call();

      expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
        value_: BigNumber.from('1005423'),
        isValid_: true,
      });
    });
  });

  describe('similar rate asset (USD)', () => {
    it.todo('returns the expected value from the valueInterpreter (non 18 decimals)');

    it('returns the expected value from the valueInterpreter (18 decimals)', async () => {
      const {
        deployment: { valueInterpreter },
        config: {
          tokens: { bnb, ren },
        },
      } = await provider.snapshot(snapshot);

      const baseDecimals = await bnb.decimals();
      const quoteDecimals = await ren.decimals();

      expect(baseDecimals).toEqBigNumber(18);
      expect(quoteDecimals).toEqBigNumber(18);

      // bnb/usd on 11/12/2020 was rated at $28.02
      // ren/usd on 11/12/2020 was rated at $0.34
      // Source (bnb): <https://www.coingecko.com/en/coins/binance-coin/historical_data/usd?start_date=2020-11-11&end_date=2020-11-11#panel>
      // Source (ren): <https://www.coingecko.com/en/coins/ren/historical_data/usd?start_date=2020-11-11&end_date=2020-11-11#panel>

      const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
        .args(bnb, utils.parseUnits('1', baseDecimals), ren)
        .call();

      expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
        value_: BigNumber.from('93029367491463738449'),
        isValid_: true,
      });
    });
  });

  describe('different rate asset (ETH/USD)', () => {
    it('returns the expected value from the valueInterpreter (18 decimals)', async () => {
      const {
        deployment: { valueInterpreter },
        config: {
          tokens: { weth, dai },
        },
      } = await provider.snapshot(snapshot);

      const baseDecimals = await weth.decimals();
      const quoteDecimals = await dai.decimals();

      expect(baseDecimals).toEqBigNumber(18);
      expect(quoteDecimals).toEqBigNumber(18);

      // weth/usd on 11/12/2020 was rated at $449.82.
      // Source: <https://www.coingecko.com/en/coins/ethereum/historical_data/usd?start_date=2020-11-11&end_date=2020-11-12#panel>

      const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
        .args(weth, utils.parseUnits('1', baseDecimals), dai)
        .call();

      expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
        value_: BigNumber.from('451750839137004610586'),
        isValid_: true,
      });
    });

    it('returns the expected value from the valueInterpreter (non 18 decimals primitives)', async () => {
      const {
        deployment: { valueInterpreter },
        config: {
          tokens: { weth, usdc },
        },
      } = await provider.snapshot(snapshot);

      const baseDecimals = await weth.decimals();
      const quoteDecimals = await usdc.decimals();

      expect(baseDecimals).toEqBigNumber(18);
      expect(quoteDecimals).toEqBigNumber(6);

      // weth/usd on 11/12/2020 was rated at $449.82.
      // Source: <https://www.coingecko.com/en/coins/ethereum/historical_data/usd?start_date=2020-11-11&end_date=2020-11-12#panel>

      const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
        .args(weth, utils.parseUnits('1', baseDecimals), usdc)
        .call();

      expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
        value_: BigNumber.from('454200983'),
        isValid_: true,
      });
    });
  });

  describe('different rate asset (USD/ETH)', () => {
    it('returns the expected value from the valueInterpreter (18 decimals)', async () => {
      const {
        deployment: { valueInterpreter },
        config: {
          tokens: { weth, dai },
        },
      } = await provider.snapshot(snapshot);

      const baseDecimals = await weth.decimals();
      const quoteDecimals = await dai.decimals();

      expect(baseDecimals).toEqBigNumber(18);
      expect(quoteDecimals).toEqBigNumber(18);

      // weth/usd on 11/12/2020 was rated at $449.82. Inverse is Ξ0.00222
      // Source: <https://www.coingecko.com/en/coins/ethereum/historical_data/usd?start_date=2020-11-11&end_date=2020-11-12#panel>

      const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
        .args(dai, utils.parseUnits('1', baseDecimals), weth)
        .call();

      expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
        value_: BigNumber.from('2213609612569475'),
        isValid_: true,
      });
    });

    it('returns the expected value from the valueInterpreter (non 18 decimals primitives)', async () => {
      const {
        deployment: { valueInterpreter },
        config: {
          tokens: { weth, usdc },
        },
      } = await provider.snapshot(snapshot);

      const baseDecimals = await weth.decimals();
      const quoteDecimals = await usdc.decimals();

      expect(baseDecimals).toEqBigNumber(18);
      expect(quoteDecimals).toEqBigNumber(6);

      // weth/usd on 11/12/2020 was rated at $449.82.
      // Source: <https://www.coingecko.com/en/coins/ethereum/historical_data/usd?start_date=2020-11-11&end_date=2020-11-12#panel>

      const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
        .args(weth, utils.parseUnits('1', baseDecimals), usdc)
        .call();

      expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
        value_: BigNumber.from('454200983'),
        isValid_: true,
      });
    });
  });
});
