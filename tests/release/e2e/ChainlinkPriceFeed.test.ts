import { AddressLike, randomAddress } from '@enzymefinance/ethers';
import {
  ChainlinkPriceFeed,
  ChainlinkRateAsset,
  IChainlinkAggregator,
  MockToken,
  StandardToken,
} from '@enzymefinance/protocol';
import { ProtocolDeployment, deployProtocolFixture } from '@enzymefinance/testutils';
import { BigNumber, constants, Signer, utils } from 'ethers';

// Unused chf/usd aggregator
const unusedAggregatorAddress = '0x449d117117838fFA61263B61dA6301AA2a88B13A';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

async function loadPrimitiveAggregator({
  chainlinkPriceFeed,
  primitive,
}: {
  chainlinkPriceFeed: ChainlinkPriceFeed;
  primitive: AddressLike;
}) {
  return new IChainlinkAggregator(
    (await chainlinkPriceFeed.getAggregatorInfoForPrimitive(primitive)).aggregator,
    provider,
  );
}

async function swapDaiAggregatorForUsd({
  chainlinkPriceFeed,
  dai,
}: {
  signer: Signer;
  chainlinkPriceFeed: ChainlinkPriceFeed;
  dai: AddressLike;
}) {
  // Deregister DAI and re-add it to use the DAI/USD aggregator.
  // This makes conversions simple by using stablecoins on both sides of the conversion,
  // which should always be nearly 1:1
  // See https://docs.chain.link/docs/using-chainlink-reference-contracts
  await chainlinkPriceFeed.removePrimitives([dai]);
  const nextDaiAggregator = new IChainlinkAggregator('0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9', provider);
  await chainlinkPriceFeed.addPrimitives([dai], [nextDaiAggregator], [ChainlinkRateAsset.USD]);

  return nextDaiAggregator;
}

describe('getCanonicalRate', () => {
  // USDC/ETH and WETH/ETH
  it('works as expected when calling getCanonicalRate (equal rate asset)', async () => {
    const chainlinkPriceFeed = fork.deployment.chainlinkPriceFeed;
    const usdc = new StandardToken(fork.config.primitives.usdc, fork.deployer);
    const weth = new StandardToken(fork.config.weth, fork.deployer);
    const usdcAggregator = await loadPrimitiveAggregator({
      chainlinkPriceFeed,
      primitive: usdc,
    });

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
    const chainlinkPriceFeed = fork.deployment.chainlinkPriceFeed;
    const dai = new StandardToken(fork.config.primitives.dai, fork.deployer);
    const usdc = new StandardToken(fork.config.primitives.usdc, fork.deployer);
    const daiAggregator = await swapDaiAggregatorForUsd({
      signer: fork.deployer,
      chainlinkPriceFeed,
      dai,
    });
    const ethUSDAggregator = new IChainlinkAggregator(await chainlinkPriceFeed.getEthUsdAggregator(), provider);
    const usdcAggregator = await loadPrimitiveAggregator({
      chainlinkPriceFeed,
      primitive: usdc,
    });

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
    const chainlinkPriceFeed = fork.deployment.chainlinkPriceFeed;
    const unregisteredMockToken = await MockToken.deploy(fork.deployer, 'Mock Token', 'MOCK', 6);
    const unusedAggregator = new IChainlinkAggregator(unusedAggregatorAddress, fork.deployer);

    // Register the unregistered primitive with the unused aggregator
    const rateAsset = ChainlinkRateAsset.ETH;
    await chainlinkPriceFeed.addPrimitives([unregisteredMockToken], [unusedAggregator], [rateAsset]);

    const info = await chainlinkPriceFeed.getAggregatorInfoForPrimitive(unregisteredMockToken);
    expect(info).toMatchFunctionOutput(chainlinkPriceFeed.getAggregatorInfoForPrimitive, {
      aggregator: unusedAggregator,
      rateAsset,
    });
    expect(await chainlinkPriceFeed.getUnitForPrimitive(unregisteredMockToken)).toEqBigNumber(
      utils.parseUnits('1', await unregisteredMockToken.decimals()),
    );
  });

  it('works as expected when adding a wrong primitive', async () => {
    const chainlinkPriceFeed = fork.deployment.chainlinkPriceFeed;
    const usdc = new StandardToken(fork.config.primitives.usdc, fork.deployer);
    const renAggregator = await loadPrimitiveAggregator({
      chainlinkPriceFeed,
      primitive: fork.config.primitives.ren,
    });

    // Adds a primitive with an invalid rate asset
    await expect(chainlinkPriceFeed.addPrimitives([usdc], [renAggregator], [2])).rejects.toBeReverted();

    // Adds a random aggregator (non aggregator contract)
    await expect(chainlinkPriceFeed.addPrimitives([usdc], [randomAddress()], [1])).rejects.toBeReverted();
  });
});

describe('updatePrimitives', () => {
  it('works as expected when updating a primitive', async () => {
    const chainlinkPriceFeed = fork.deployment.chainlinkPriceFeed;
    const dai = new StandardToken(fork.config.primitives.dai, fork.deployer);
    const unusedAggregator = new IChainlinkAggregator(unusedAggregatorAddress, fork.deployer);

    const daiRateAsset = await chainlinkPriceFeed.getRateAssetForPrimitive(dai);

    // Update dai to use the unused aggregator
    await chainlinkPriceFeed.updatePrimitives([dai], [unusedAggregator]);

    const info = await chainlinkPriceFeed.getAggregatorInfoForPrimitive(dai);
    expect(info).toMatchFunctionOutput(chainlinkPriceFeed.getAggregatorInfoForPrimitive, {
      aggregator: unusedAggregator,
      rateAsset: daiRateAsset,
    });
  });
});

describe('removePrimitives', () => {
  it('works as expected when removing a primitive', async () => {
    const chainlinkPriceFeed = fork.deployment.chainlinkPriceFeed;
    const dai = new StandardToken(fork.config.primitives.dai, fork.deployer);

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
    const [randomUser] = fork.accounts;
    const chainlinkPriceFeed = fork.deployment.chainlinkPriceFeed;
    const dai = new StandardToken(fork.config.primitives.dai, fork.deployer);

    // Should fail initially because the rate is not stale
    await expect(chainlinkPriceFeed.connect(randomUser).removeStalePrimitives([dai])).rejects.toBeRevertedWith(
      'Rate is not stale',
    );

    // Should succeed after warping beyond staleness threshold
    const stalenessThreshold = await chainlinkPriceFeed.getStaleRateThreshold();
    await provider.send('evm_increaseTime', [stalenessThreshold.toNumber()]);
    await expect(chainlinkPriceFeed.connect(randomUser).removeStalePrimitives([dai])).resolves.toBeReceipt();
  });
});

describe('expected values', () => {
  describe('similar rate asset (ETH)', () => {
    // USDC/ETH and USDT/ETH
    it('returns the expected value from the valueInterpreter (same decimals)', async () => {
      const valueInterpreter = fork.deployment.valueInterpreter;
      const usdc = new StandardToken(fork.config.primitives.usdc, fork.deployer);
      const usdt = new StandardToken(fork.config.primitives.usdt, fork.deployer);

      const baseDecimals = await usdc.decimals();
      const quoteDecimals = await usdt.decimals();
      expect(baseDecimals).toEqBigNumber(quoteDecimals);

      const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
        .args(usdc, utils.parseUnits('1', baseDecimals), usdt)
        .call();

      // Should be near 1000000 (10^6)
      expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
        value_: BigNumber.from('1003473'),
        isValid_: true,
      });
    });

    // SUSD/ETH and USDC/ETH
    it('returns the expected value from the valueInterpreter (different decimals)', async () => {
      const valueInterpreter = fork.deployment.valueInterpreter;
      const usdc = new StandardToken(fork.config.primitives.usdc, fork.deployer);
      const susd = new StandardToken(fork.config.primitives.susd, fork.deployer);

      const baseDecimals = await susd.decimals();
      const quoteDecimals = await usdc.decimals();
      expect(baseDecimals).not.toEqBigNumber(quoteDecimals);

      const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
        .args(susd, utils.parseUnits('1', baseDecimals), usdc)
        .call();

      // Should be near 1000000 (10^6)
      expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
        value_: BigNumber.from('1001862'),
        isValid_: true,
      });
    });
  });

  describe('similar rate asset (USD)', () => {
    it.todo('returns the expected value from the valueInterpreter (non 18 decimals)');

    // BNB/USD and REN/USD
    it('returns the expected value from the valueInterpreter (18 decimals)', async () => {
      const valueInterpreter = fork.deployment.valueInterpreter;
      const bnb = new StandardToken(fork.config.primitives.bnb, fork.deployer);
      const ren = new StandardToken(fork.config.primitives.ren, fork.deployer);

      const baseDecimals = await bnb.decimals();
      const quoteDecimals = await ren.decimals();
      expect(baseDecimals).toEqBigNumber(quoteDecimals);

      const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
        .args(bnb, utils.parseUnits('1', baseDecimals), ren)
        .call();

      expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
        value_: BigNumber.from('702415059660165691536'),
        isValid_: true,
      });
    });
  });

  describe('different rate asset (ETH rate -> USD rate)', () => {
    // SUSD/ETH and DAI/USD
    it('returns the expected value from the valueInterpreter (same decimals)', async () => {
      const chainlinkPriceFeed = fork.deployment.chainlinkPriceFeed;
      const valueInterpreter = fork.deployment.valueInterpreter;
      const dai = new StandardToken(fork.config.primitives.dai, fork.deployer);
      const susd = new StandardToken(fork.config.primitives.susd, fork.deployer);

      await swapDaiAggregatorForUsd({
        signer: fork.deployer,
        chainlinkPriceFeed,
        dai,
      });

      const baseDecimals = await susd.decimals();
      const quoteDecimals = await dai.decimals();
      expect(baseDecimals).toEqBigNumber(quoteDecimals);

      const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
        .args(susd, utils.parseUnits('1', baseDecimals), dai)
        .call();

      // Should be near 1000000000000000000 (10^18)
      expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
        value_: BigNumber.from('1010460668047292019'),
        isValid_: true,
      });
    });

    // USDC/ETH and DAI/USD
    it('returns the expected value from the valueInterpreter (non 18 decimals primitives)', async () => {
      const chainlinkPriceFeed = fork.deployment.chainlinkPriceFeed;
      const valueInterpreter = fork.deployment.valueInterpreter;
      const dai = new StandardToken(fork.config.primitives.dai, fork.deployer);
      const usdc = new StandardToken(fork.config.primitives.usdc, fork.deployer);

      await swapDaiAggregatorForUsd({
        signer: fork.deployer,
        chainlinkPriceFeed,
        dai,
      });

      const baseDecimals = await usdc.decimals();
      const quoteDecimals = await dai.decimals();
      expect(baseDecimals).not.toEqBigNumber(quoteDecimals);

      const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
        .args(usdc, utils.parseUnits('1', baseDecimals), dai)
        .call();

      // Should be near 1000000000000000000 (10^18)
      expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
        value_: BigNumber.from('1008581931722281053'),
        isValid_: true,
      });
    });
  });

  describe('different rate asset (USD rate -> ETH rate)', () => {
    // DAI/USD and SUSD/ETH
    it('returns the expected value from the valueInterpreter (18 decimals)', async () => {
      const chainlinkPriceFeed = fork.deployment.chainlinkPriceFeed;
      const valueInterpreter = fork.deployment.valueInterpreter;
      const dai = new StandardToken(fork.config.primitives.dai, fork.deployer);
      const susd = new StandardToken(fork.config.primitives.susd, fork.deployer);

      await swapDaiAggregatorForUsd({
        signer: fork.deployer,
        chainlinkPriceFeed,
        dai,
      });

      const baseDecimals = await dai.decimals();
      const quoteDecimals = await susd.decimals();
      expect(baseDecimals).toEqBigNumber(quoteDecimals);

      const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
        .args(dai, utils.parseUnits('1', baseDecimals), susd)
        .call();

      // Should be near 1000000000000000000 (10^18)
      expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
        value_: BigNumber.from('989647624714075031'),
        isValid_: true,
      });
    });

    // DAI/USD and USDC/ETH
    it('returns the expected value from the valueInterpreter (non 18 decimals primitives)', async () => {
      const chainlinkPriceFeed = fork.deployment.chainlinkPriceFeed;
      const valueInterpreter = fork.deployment.valueInterpreter;
      const dai = new StandardToken(fork.config.primitives.dai, fork.deployer);
      const usdc = new StandardToken(fork.config.primitives.usdc, fork.deployer);

      await swapDaiAggregatorForUsd({
        signer: fork.deployer,
        chainlinkPriceFeed,
        dai,
      });

      const baseDecimals = await dai.decimals();
      const quoteDecimals = await usdc.decimals();
      expect(baseDecimals).not.toEqBigNumber(quoteDecimals);

      const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
        .args(dai, utils.parseUnits('1', baseDecimals), usdc)
        .call();

      // Should be near 1000000 (10^6)
      expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreter.calcCanonicalAssetValue, {
        value_: BigNumber.from('991491'),
        isValid_: true,
      });
    });
  });
});
