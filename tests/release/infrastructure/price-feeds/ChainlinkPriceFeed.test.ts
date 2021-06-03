import { AddressLike, extractEvent, randomAddress, resolveAddress } from '@enzymefinance/ethers';
import {
  IChainlinkAggregator,
  ChainlinkPriceFeed,
  ChainlinkRateAsset,
  MockToken,
  StandardToken,
} from '@enzymefinance/protocol';
import {
  addNewAssetsToFund,
  assertEvent,
  buyShares,
  createNewFund,
  deployProtocolFixture,
  getAssetUnit,
  ProtocolDeployment,
} from '@enzymefinance/testutils';
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

describe('primitives gas costs', () => {
  it('adds to calcGav for weth-denominated fund (same rate assets)', async () => {
    const [fundOwner, investor] = fork.accounts;
    const dai = new StandardToken(fork.config.primitives.dai, whales.dai);
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const denominationAsset = weth;
    const integrationManager = fork.deployment.integrationManager;

    const { comptrollerProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset,
    });

    const initialTokenAmount = utils.parseEther('1');

    // Seed investor and buy shares to add denomination asset
    await buyShares({
      comptrollerProxy,
      buyer: investor,
      denominationAsset,
      investmentAmount: initialTokenAmount,
      seedBuyer: true,
    });

    // Calc base cost of calcGav with already tracked assets
    const calcGavBaseGas = (await comptrollerProxy.calcGav(true)).gasUsed;

    // Seed fund with dai and add it to tracked assets
    await addNewAssetsToFund({
      signer: fundOwner,
      comptrollerProxy,
      integrationManager,
      assets: [dai],
      amounts: [await getAssetUnit(dai)],
    });

    // Get the calcGav() cost including dai
    const calcGavWithToken = await comptrollerProxy.calcGav(true);

    // Assert gas
    expect(calcGavWithToken).toCostLessThan(calcGavBaseGas.add(39000));
  });

  it('adds to calcGav for weth-denominated fund (different rate assets)', async () => {
    const [fundOwner, investor] = fork.accounts;
    const dai = new StandardToken(fork.config.primitives.dai, whales.dai);
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const denominationAsset = weth;
    const integrationManager = fork.deployment.integrationManager;
    const chainlinkPriceFeed = fork.deployment.chainlinkPriceFeed;

    await swapDaiAggregatorForUsd({
      signer: fork.deployer,
      chainlinkPriceFeed,
      dai,
    });

    const { comptrollerProxy } = await createNewFund({
      signer: fundOwner,
      fundOwner,
      fundDeployer: fork.deployment.fundDeployer,
      denominationAsset,
    });

    const initialTokenAmount = utils.parseEther('1');

    // Buy shares to add denomination asset
    await buyShares({
      comptrollerProxy,
      buyer: investor,
      denominationAsset,
      investmentAmount: initialTokenAmount,
      seedBuyer: true,
    });

    // Calc base cost of calcGav with already tracked assets
    const calcGavBaseGas = (await comptrollerProxy.calcGav(true)).gasUsed;

    // Seed fund with dai and add it to tracked assets
    await addNewAssetsToFund({
      signer: fundOwner,
      comptrollerProxy,
      integrationManager,
      assets: [dai],
      amounts: [await getAssetUnit(dai)],
    });

    // Get the calcGav() cost including dai
    const calcGavWithToken = await comptrollerProxy.calcGav(true);

    // Assert gas
    expect(calcGavWithToken).toCostLessThan(calcGavBaseGas.add(59000));
  });
});

describe('constructor', () => {
  it('sets state vars', async () => {
    const chainlinkPriceFeed = fork.deployment.chainlinkPriceFeed;
    const weth = fork.config.weth;

    const storedWeth = await chainlinkPriceFeed.getWethToken();
    const storedEthUsdAggregator = await chainlinkPriceFeed.getEthUsdAggregator();

    // Check variables
    expect(storedWeth).toMatchAddress(weth);
    expect(storedEthUsdAggregator).toMatchAddress(fork.config.chainlink.ethusd);

    // Check static weth values
    expect(await chainlinkPriceFeed.getRateAssetForPrimitive(weth)).toEqBigNumber(ChainlinkRateAsset.ETH);
    expect(await chainlinkPriceFeed.getUnitForPrimitive(weth)).toEqBigNumber(utils.parseEther('1'));

    // Check primitives setup
    for (const symbol of Object.keys(fork.config.primitives)) {
      const storedPrimitive = await chainlinkPriceFeed.getAggregatorInfoForPrimitive(fork.config.primitives[symbol]);
      expect(storedPrimitive).toMatchFunctionOutput(chainlinkPriceFeed.getAggregatorInfoForPrimitive, {
        aggregator: fork.config.chainlink.aggregators[symbol][0],
        rateAsset: fork.config.chainlink.aggregators[symbol][1],
      });
    }

    // FundDeployerOwnerMixin
    expect(await chainlinkPriceFeed.getFundDeployer()).toMatchAddress(fork.deployment.fundDeployer);
  });
});

describe('addPrimitives', () => {
  it('reverts when the aggregator is empty', async () => {
    const chainlinkPriceFeed = fork.deployment.chainlinkPriceFeed;

    // Set the aggregator address to zero
    const aggregatorAddress = constants.AddressZero;

    await expect(
      chainlinkPriceFeed.addPrimitives([randomAddress()], [aggregatorAddress], [0]),
    ).rejects.toBeRevertedWith('Empty _aggregator');
  });

  it('reverts when primitives are empty', async () => {
    const chainlinkPriceFeed = fork.deployment.chainlinkPriceFeed;

    await expect(chainlinkPriceFeed.addPrimitives([], [randomAddress()], [0])).rejects.toBeRevertedWith(
      '_primitives cannot be empty',
    );
  });

  it('reverts when params array length differs', async () => {
    const chainlinkPriceFeed = fork.deployment.chainlinkPriceFeed;

    // Check they revert
    await expect(
      chainlinkPriceFeed.addPrimitives([randomAddress()], [randomAddress(), randomAddress()], [0]),
    ).rejects.toBeRevertedWith('Unequal _primitives and _aggregators array lengths');
    await expect(
      chainlinkPriceFeed.addPrimitives([randomAddress()], [randomAddress()], [0, 0]),
    ).rejects.toBeRevertedWith('Unequal _primitives and _rateAssets array lengths');
  });

  it('reverts when the primitive is already set', async () => {
    const chainlinkPriceFeed = fork.deployment.chainlinkPriceFeed;
    const primitives = [fork.config.primitives.mln];
    const aggregators = [fork.config.chainlink.aggregators.mln[0]];
    const rateAssets = [fork.config.chainlink.aggregators.mln[1]];

    await expect(chainlinkPriceFeed.addPrimitives(primitives, aggregators, rateAssets)).rejects.toBeRevertedWith(
      'Value already set',
    );
  });

  xit('reverts when latest answer is zero', async () => {
    /*
    const chainlinkPriceFeed = fork.deployment.chainlinkPriceFeed;

    // Set latest answer on aggregator mock to be 0
    const latestTimestamp = (await provider.getBlock('latest')).timestamp;
    const latestAnswer = 0;

    await aggregatorMocks[0].setLatestAnswer(latestAnswer, latestTimestamp);

    await expect(
      chainlinkPriceFeed.addPrimitives([primitiveMocks[0]], [aggregatorMocks[0]], [0]),
    ).rejects.toBeRevertedWith('No rate detected');
    */
  });

  it('works as expected when adding a primitive and emit an event', async () => {
    const chainlinkPriceFeed = fork.deployment.chainlinkPriceFeed;
    const unregisteredMockToken = await MockToken.deploy(fork.deployer, 'Mock Token', 'MOCK', 6);
    const unusedAggregator = new IChainlinkAggregator(unusedAggregatorAddress, fork.deployer);

    // Register the unregistered primitive with the unused aggregator
    const rateAsset = ChainlinkRateAsset.ETH;
    const receipt = await chainlinkPriceFeed.addPrimitives([unregisteredMockToken], [unusedAggregator], [rateAsset]);

    // Extract events
    const events = extractEvent(receipt, 'PrimitiveAdded');
    expect(events).toHaveLength(1);

    const primitiveUnit = utils.parseUnits('1', await unregisteredMockToken.decimals());

    expect(events[0]).toMatchEventArgs({
      primitive: unregisteredMockToken,
      aggregator: unusedAggregator,
      rateAsset: rateAsset,
      unit: primitiveUnit,
    });

    const info = await chainlinkPriceFeed.getAggregatorInfoForPrimitive(unregisteredMockToken);
    expect(info).toMatchFunctionOutput(chainlinkPriceFeed.getAggregatorInfoForPrimitive, {
      aggregator: unusedAggregator,
      rateAsset,
    });
    expect(await chainlinkPriceFeed.getUnitForPrimitive(unregisteredMockToken)).toEqBigNumber(primitiveUnit);
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
  it('reverts when primitives are empty', async () => {
    const chainlinkPriceFeed = fork.deployment.chainlinkPriceFeed;

    // Update primitives with an empty value
    const updatedPrimitives = chainlinkPriceFeed.updatePrimitives([], [randomAddress()]);
    await expect(updatedPrimitives).rejects.toBeRevertedWith('_primitives cannot be empty');
  });

  it('reverts when updating a non added primitive', async () => {
    const chainlinkPriceFeed = fork.deployment.chainlinkPriceFeed;

    // Update primitives with a random address
    await expect(chainlinkPriceFeed.updatePrimitives([randomAddress()], [randomAddress()])).rejects.toBeRevertedWith(
      'Primitive not yet added',
    );
  });

  it('reverts when updating a primitive to an already set value', async () => {
    const chainlinkPriceFeed = fork.deployment.chainlinkPriceFeed;

    // Update to the same values
    await expect(
      chainlinkPriceFeed.updatePrimitives([fork.config.primitives.mln], [fork.config.chainlink.aggregators.mln[0]]),
    ).rejects.toBeRevertedWith('Value already set');
  });

  it('works as expected when updating a primitive and emit an event', async () => {
    const chainlinkPriceFeed = fork.deployment.chainlinkPriceFeed;
    const dai = new StandardToken(fork.config.primitives.dai, fork.deployer);
    const unusedAggregator = new IChainlinkAggregator(unusedAggregatorAddress, fork.deployer);

    const daiRateAsset = await chainlinkPriceFeed.getRateAssetForPrimitive(dai);

    // Update dai to use the unused aggregator
    const receipt = await chainlinkPriceFeed.updatePrimitives([dai], [unusedAggregator]);

    // Check events and values stored are consistent
    const events = extractEvent(receipt, 'PrimitiveUpdated');
    expect(events).toHaveLength(1);

    expect(events[0]).toMatchEventArgs({
      primitive: dai,
      nextAggregator: unusedAggregator,
      prevAggregator: fork.config.chainlink.aggregators.dai[0],
    });

    const info = await chainlinkPriceFeed.getAggregatorInfoForPrimitive(dai);
    expect(info).toMatchFunctionOutput(chainlinkPriceFeed.getAggregatorInfoForPrimitive, {
      aggregator: unusedAggregator,
      rateAsset: daiRateAsset,
    });
  });
});

describe('removePrimitives', () => {
  it('reverts when primitives are empty', async () => {
    const chainlinkPriceFeed = fork.deployment.chainlinkPriceFeed;

    // Call remove with empty values
    await expect(chainlinkPriceFeed.removePrimitives([])).rejects.toBeRevertedWith('_primitives cannot be empty');
  });

  it('reverts when primitives have not yet been added', async () => {
    const chainlinkPriceFeed = fork.deployment.chainlinkPriceFeed;

    // Call remove on a random (non added) address
    await expect(chainlinkPriceFeed.removePrimitives([randomAddress()])).rejects.toBeRevertedWith(
      'Primitive not yet added',
    );
  });

  it('works as expected when removing a primitive and emit an event', async () => {
    const chainlinkPriceFeed = fork.deployment.chainlinkPriceFeed;
    const dai = new StandardToken(fork.config.primitives.dai, fork.deployer);

    const receipt = await chainlinkPriceFeed.removePrimitives([dai]);

    // Remove and check consistent values and events
    const events = extractEvent(receipt, 'PrimitiveRemoved');
    expect(events).toHaveLength(1);

    expect(events[0]).toMatchEventArgs({ primitive: dai });

    expect(await chainlinkPriceFeed.getUnitForPrimitive(dai)).toEqBigNumber(0);

    const info = await chainlinkPriceFeed.getAggregatorInfoForPrimitive(dai);
    expect(info).toMatchFunctionOutput(chainlinkPriceFeed.getAggregatorInfoForPrimitive, {
      aggregator: constants.AddressZero,
      rateAsset: 0,
    });
  });
});

describe('removeStalePrimitives', () => {
  it('reverts when primitives are empty', async () => {
    const chainlinkPriceFeed = fork.deployment.chainlinkPriceFeed;

    // Call remove with empty values
    await expect(chainlinkPriceFeed.removeStalePrimitives([])).rejects.toBeRevertedWith('_primitives cannot be empty');
  });

  it('reverts when primitives have not yet been added', async () => {
    const chainlinkPriceFeed = fork.deployment.chainlinkPriceFeed;

    // Call remove on a random (non added) address
    await expect(chainlinkPriceFeed.removeStalePrimitives([randomAddress()])).rejects.toBeRevertedWith(
      'Invalid primitive',
    );
  });

  it('allows a random user to remove a stale primitive based on the timestamp, and fires the correct event', async () => {
    const [arbitraryUser] = fork.accounts;
    const chainlinkPriceFeed = fork.deployment.chainlinkPriceFeed;

    const primitivesToRemove = [fork.config.primitives.dai, fork.config.primitives.usdc];

    // Should fail initially because the rate is not stale
    await expect(
      chainlinkPriceFeed.connect(arbitraryUser).removeStalePrimitives(primitivesToRemove),
    ).rejects.toBeRevertedWith('Rate is not stale');

    // Should succeed after warping beyond staleness threshold
    await provider.send('evm_increaseTime', [60 * 60 * 49]);
    await provider.send('evm_mine', []);
    const receipt = await chainlinkPriceFeed.connect(arbitraryUser).removeStalePrimitives(primitivesToRemove);

    // Assert that the primitive has been removed from storage, and that the correct event fired
    const events = extractEvent(receipt, 'StalePrimitiveRemoved');
    expect(events).toHaveLength(primitivesToRemove.length);
    for (let i = 0; i < primitivesToRemove.length; i++) {
      const aggregatorInfo = await chainlinkPriceFeed.getAggregatorInfoForPrimitive(primitivesToRemove[i]);
      expect(aggregatorInfo).toMatchFunctionOutput(chainlinkPriceFeed.getAggregatorInfoForPrimitive, {
        aggregator: constants.AddressZero,
        rateAsset: 0,
      });

      expect(events[i]).toMatchEventArgs({ primitive: resolveAddress(primitivesToRemove[i]) });
    }
  });
});

describe('setEthUsdAggregator', () => {
  it('properly sets eth/usd aggregator', async () => {
    const chainlinkPriceFeed = fork.deployment.chainlinkPriceFeed;
    const aggregator = fork.config.chainlink.aggregators.mln[0];

    // Get already stored ETH USD aggregator
    const storedEthUsdAggregator = await chainlinkPriceFeed.getEthUsdAggregator();

    // Update to new value
    const setEthUsdAggregatorReceipt = await chainlinkPriceFeed.setEthUsdAggregator(aggregator);

    const updatedEthUsdAggregator = await chainlinkPriceFeed.getEthUsdAggregator();
    expect(updatedEthUsdAggregator).toMatchAddress(aggregator);

    // Event should inlude the old and new ETH USD aggregators
    assertEvent(setEthUsdAggregatorReceipt, 'EthUsdAggregatorSet', {
      prevEthUsdAggregator: storedEthUsdAggregator,
      nextEthUsdAggregator: updatedEthUsdAggregator,
    });
  });

  it('reverts when setting an already set aggregator', async () => {
    const chainlinkPriceFeed = fork.deployment.chainlinkPriceFeed;

    const storedEthUsdAggregator = await chainlinkPriceFeed.getEthUsdAggregator();

    // Set the same aggregator than stored
    await expect(chainlinkPriceFeed.setEthUsdAggregator(storedEthUsdAggregator)).rejects.toBeRevertedWith(
      'Value already set',
    );
  });
});

// NOTE: Behaviour tests included under e2e tests
describe('getCanonicalRate', () => {
  xit('reverts when it receives a negative or zero value', async () => {
    /*
    const { chainlinkPriceFeed, aggregatorMocks, primitiveMocks } = await provider.snapshot(snapshot);

    // Create aggreagator mocks with negative (-1) and 0 values
    const latestTimestamp = (await provider.getBlock('latest')).timestamp;
    await aggregatorMocks[0].setLatestAnswer(-1, latestTimestamp);
    await aggregatorMocks[1].setLatestAnswer(constants.Zero, latestTimestamp);

    // Check both revert
    await expect(
      chainlinkPriceFeed.addPrimitives([primitiveMocks[0]], [aggregatorMocks[0]], [0]),
    ).rejects.toBeRevertedWith('No rate detected');
    await expect(
      chainlinkPriceFeed.addPrimitives([primitiveMocks[1]], [aggregatorMocks[1]], [0]),
    ).rejects.toBeRevertedWith('No rate detected');
    */
  });

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

describe('setStaleRateThreshold', () => {
  it('does not allow its prev value', async () => {
    const chainlinkPriceFeed = fork.deployment.chainlinkPriceFeed;

    const storedStaleRateThreshold = await chainlinkPriceFeed.getStaleRateThreshold();

    await expect(chainlinkPriceFeed.setStaleRateThreshold(storedStaleRateThreshold)).rejects.toBeRevertedWith(
      'Value already set',
    );
  });

  it('properly sets value', async () => {
    const chainlinkPriceFeed = fork.deployment.chainlinkPriceFeed;

    // Get stored staleRateThreshold
    const storedStaleRateThreshold = await chainlinkPriceFeed.getStaleRateThreshold();

    // Set new value to 1 day
    const newStaleThreshold = 60 * 60 * 24;
    const setStaleRateThresholdReceipt = await chainlinkPriceFeed.setStaleRateThreshold(newStaleThreshold);

    //Check events
    const updatedStaleRateThreshold = await chainlinkPriceFeed.getStaleRateThreshold();
    expect(updatedStaleRateThreshold).toEqBigNumber(newStaleThreshold);

    assertEvent(setStaleRateThresholdReceipt, 'StaleRateThresholdSet', {
      prevStaleRateThreshold: storedStaleRateThreshold,
      nextStaleRateThreshold: newStaleThreshold,
    });
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

      // bnb/usd on May 31, 2021 was about $325
      // ren/usd on May 31, 2021 was about $0.45
      // Source (bnb): <https://www.coingecko.com/en/coins/binance-coin/historical_data/usd?start_date=2021-05-31&end_date=2021-05-31>
      // Source (ren): <https://www.coingecko.com/en/coins/ren/historical_data/usd?start_date=2021-03-31&end_date=2021-05-31>
      // 1 bnb was about 722 REN

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
