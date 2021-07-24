import { AddressLike, extractEvent, randomAddress, resolveAddress } from '@enzymefinance/ethers';
import { SignerWithAddress } from '@enzymefinance/hardhat';
import {
  IChainlinkAggregator,
  ValueInterpreter,
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
import { constants, Signer, utils } from 'ethers';

// Unused chf/usd aggregator
const unusedAggregatorAddress = '0x449d117117838fFA61263B61dA6301AA2a88B13A';

let fork: ProtocolDeployment;
beforeEach(async () => {
  fork = await deployProtocolFixture();
});

async function loadPrimitiveAggregator({
  valueInterpreter,
  primitive,
}: {
  valueInterpreter: ValueInterpreter;
  primitive: AddressLike;
}) {
  return new IChainlinkAggregator(await valueInterpreter.getAggregatorForPrimitive(primitive), provider);
}

async function swapDaiAggregatorForUsd({
  valueInterpreter,
  dai,
}: {
  signer: Signer;
  valueInterpreter: ValueInterpreter;
  dai: AddressLike;
}) {
  // Deregister DAI and re-add it to use the DAI/USD aggregator.
  // This makes conversions simple by using stablecoins on both sides of the conversion,
  // which should always be nearly 1:1
  // See https://docs.chain.link/docs/using-chainlink-reference-contracts
  await valueInterpreter.removePrimitives([dai]);
  const nextDaiAggregator = new IChainlinkAggregator('0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9', provider);
  await valueInterpreter.addPrimitives([dai], [nextDaiAggregator], [ChainlinkRateAsset.USD]);

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
    expect(calcGavWithToken).toCostAround(calcGavBaseGas.add(36000));
  });

  it('adds to calcGav for weth-denominated fund (different rate assets)', async () => {
    const [fundOwner, investor] = fork.accounts;
    const dai = new StandardToken(fork.config.primitives.dai, whales.dai);
    const weth = new StandardToken(fork.config.weth, whales.weth);
    const denominationAsset = weth;
    const integrationManager = fork.deployment.integrationManager;
    const valueInterpreter = fork.deployment.valueInterpreter;

    await swapDaiAggregatorForUsd({
      signer: fork.deployer,
      valueInterpreter,
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
    expect(calcGavWithToken).toCostAround(calcGavBaseGas.add(56000));
  });
});

describe('constructor', () => {
  it('sets state vars', async () => {
    const valueInterpreter = fork.deployment.valueInterpreter;
    const weth = fork.config.weth;

    const storedWeth = await valueInterpreter.getWethToken();
    const storedEthUsdAggregator = await valueInterpreter.getEthUsdAggregator();

    // Check variables
    expect(storedWeth).toMatchAddress(weth);
    expect(storedEthUsdAggregator).toMatchAddress(fork.config.chainlink.ethusd);

    // Check static weth values
    expect(await valueInterpreter.getRateAssetForPrimitive(weth)).toEqBigNumber(ChainlinkRateAsset.ETH);
    expect(await valueInterpreter.getUnitForPrimitive(weth)).toEqBigNumber(utils.parseEther('1'));

    // Check primitives setup
    for (const symbol of Object.keys(fork.config.primitives)) {
      expect(await valueInterpreter.getAggregatorForPrimitive(fork.config.primitives[symbol])).toMatchAddress(
        fork.config.chainlink.aggregators[symbol][0],
      );
      expect(await valueInterpreter.getRateAssetForPrimitive(fork.config.primitives[symbol])).toMatchFunctionOutput(
        valueInterpreter.getRateAssetForPrimitive,
        fork.config.chainlink.aggregators[symbol][1],
      );
    }

    // FundDeployerOwnerMixin
    expect(await valueInterpreter.getFundDeployer()).toMatchAddress(fork.deployment.fundDeployer);
  });
});

describe('addPrimitives', () => {
  it('does not allow a random caller', async () => {
    const valueInterpreter = fork.deployment.valueInterpreter;
    const [randomUser] = fork.accounts;

    await expect(
      valueInterpreter.connect(randomUser).addPrimitives([randomAddress()], [randomAddress(), randomAddress()], [0]),
    ).rejects.toBeRevertedWith('Only the FundDeployer owner can call this function');
  });

  it('reverts when params array length differs', async () => {
    const valueInterpreter = fork.deployment.valueInterpreter;

    // Check they revert
    await expect(
      valueInterpreter.addPrimitives([randomAddress()], [randomAddress(), randomAddress()], [0]),
    ).rejects.toBeRevertedWith('Unequal _primitives and _aggregators array lengths');
    await expect(valueInterpreter.addPrimitives([randomAddress()], [randomAddress()], [0, 0])).rejects.toBeRevertedWith(
      'Unequal _primitives and _rateAssets array lengths',
    );
  });

  it('reverts when the primitive is already set', async () => {
    const valueInterpreter = fork.deployment.valueInterpreter;
    const primitives = [fork.config.primitives.mln];
    const aggregators = [fork.config.chainlink.aggregators.mln[0]];
    const rateAssets = [fork.config.chainlink.aggregators.mln[1]];

    await expect(valueInterpreter.addPrimitives(primitives, aggregators, rateAssets)).rejects.toBeRevertedWith(
      'Value already set',
    );
  });

  it('works as expected when adding a primitive and emit an event', async () => {
    const valueInterpreter = fork.deployment.valueInterpreter;
    const unregisteredMockToken = await MockToken.deploy(fork.deployer, 'Mock Token', 'MOCK', 6);
    const unusedAggregator = new IChainlinkAggregator(unusedAggregatorAddress, fork.deployer);

    // Register the unregistered primitive with the unused aggregator
    const rateAsset = ChainlinkRateAsset.ETH;
    const receipt = await valueInterpreter.addPrimitives([unregisteredMockToken], [unusedAggregator], [rateAsset]);

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

    expect(await valueInterpreter.getAggregatorForPrimitive(unregisteredMockToken)).toMatchAddress(unusedAggregator);
    expect(await valueInterpreter.getRateAssetForPrimitive(unregisteredMockToken)).toMatchFunctionOutput(
      valueInterpreter.getRateAssetForPrimitive,
      rateAsset,
    );
    expect(await valueInterpreter.getUnitForPrimitive(unregisteredMockToken)).toEqBigNumber(primitiveUnit);
  });

  it('works as expected when adding a wrong primitive', async () => {
    const valueInterpreter = fork.deployment.valueInterpreter;
    const usdc = new StandardToken(fork.config.primitives.usdc, fork.deployer);
    const renAggregator = await loadPrimitiveAggregator({
      valueInterpreter,
      primitive: fork.config.primitives.ren,
    });

    // Adds a primitive with an invalid rate asset
    await expect(valueInterpreter.addPrimitives([usdc], [renAggregator], [2])).rejects.toBeReverted();

    // Adds a random aggregator (non aggregator contract)
    await expect(valueInterpreter.addPrimitives([usdc], [randomAddress()], [1])).rejects.toBeReverted();
  });
});

describe('updatePrimitives', () => {
  let randomUser: SignerWithAddress;
  let valueInterpreter: ValueInterpreter;
  let aggregatorsToUpdate: AddressLike[], primitivesToUpdate: StandardToken[], rateAssetsToUpdate: ChainlinkRateAsset[];

  beforeEach(async () => {
    [randomUser] = fork.accounts;
    valueInterpreter = fork.deployment.valueInterpreter;

    primitivesToUpdate = [
      new StandardToken(fork.config.primitives.dai, provider),
      new StandardToken(fork.config.primitives.usdc, provider),
    ];
    // Just swapping aggregators will suffice for this test
    aggregatorsToUpdate = [fork.config.chainlink.aggregators.usdc[0], fork.config.chainlink.aggregators.dai[0]];
    rateAssetsToUpdate = [ChainlinkRateAsset.USD, ChainlinkRateAsset.USD];
  });

  it('does not allow a random caller', async () => {
    await expect(
      valueInterpreter
        .connect(randomUser)
        .updatePrimitives(primitivesToUpdate, aggregatorsToUpdate, rateAssetsToUpdate),
    ).rejects.toBeRevertedWith('Only the FundDeployer owner can call this function');
  });

  it('happy path', async () => {
    const receipt = await valueInterpreter.updatePrimitives(
      primitivesToUpdate,
      aggregatorsToUpdate,
      rateAssetsToUpdate,
    );

    // Check events and values stored are consistent
    const addedEvents = extractEvent(receipt, 'PrimitiveAdded');
    expect(addedEvents).toHaveLength(primitivesToUpdate.length);
    const removedEvents = extractEvent(receipt, 'PrimitiveRemoved');
    expect(removedEvents).toHaveLength(primitivesToUpdate.length);

    for (const i in primitivesToUpdate) {
      const assetUnit = await getAssetUnit(primitivesToUpdate[i]);
      expect(addedEvents[i]).toMatchEventArgs({
        primitive: primitivesToUpdate[i],
        aggregator: aggregatorsToUpdate[i],
        rateAsset: rateAssetsToUpdate[i],
        unit: assetUnit,
      });
      expect(removedEvents[i]).toMatchEventArgs({
        primitive: primitivesToUpdate[i],
      });

      expect(await valueInterpreter.getAggregatorForPrimitive(primitivesToUpdate[i])).toMatchAddress(
        aggregatorsToUpdate[i],
      );
      expect(await valueInterpreter.getRateAssetForPrimitive(primitivesToUpdate[i])).toMatchFunctionOutput(
        valueInterpreter.getRateAssetForPrimitive,
        rateAssetsToUpdate[i],
      );
    }
  });
});

describe('removePrimitives', () => {
  it('does not allow a random caller', async () => {
    const valueInterpreter = fork.deployment.valueInterpreter;
    const [randomUser] = fork.accounts;

    await expect(
      valueInterpreter.connect(randomUser).removePrimitives([fork.config.primitives.dai]),
    ).rejects.toBeRevertedWith('Only the FundDeployer owner can call this function');
  });

  it('reverts when primitives have not yet been added', async () => {
    const valueInterpreter = fork.deployment.valueInterpreter;

    // Call remove on a random (non added) address
    await expect(valueInterpreter.removePrimitives([randomAddress()])).rejects.toBeRevertedWith(
      'Primitive not yet added',
    );
  });

  it('works as expected when removing a primitive and emit an event', async () => {
    const valueInterpreter = fork.deployment.valueInterpreter;
    const dai = new StandardToken(fork.config.primitives.dai, fork.deployer);

    const receipt = await valueInterpreter.removePrimitives([dai]);

    // Remove and check consistent values and events
    const events = extractEvent(receipt, 'PrimitiveRemoved');
    expect(events).toHaveLength(1);

    expect(events[0]).toMatchEventArgs({ primitive: dai });

    expect(await valueInterpreter.getUnitForPrimitive(dai)).toEqBigNumber(0);

    expect(await valueInterpreter.getAggregatorForPrimitive(dai)).toMatchAddress(constants.AddressZero);
    expect(await valueInterpreter.getRateAssetForPrimitive(dai)).toBe(0);
  });
});

describe('removeStalePrimitives', () => {
  it('reverts when primitives have not yet been added', async () => {
    const valueInterpreter = fork.deployment.valueInterpreter;

    // Call remove on a random (non added) address
    await expect(valueInterpreter.removeStalePrimitives([randomAddress()])).rejects.toBeRevertedWith(
      'Invalid primitive',
    );
  });

  it('allows a random user to remove a stale primitive based on the timestamp, and fires the correct event', async () => {
    const [arbitraryUser] = fork.accounts;
    const valueInterpreter = fork.deployment.valueInterpreter;

    const primitivesToRemove = [fork.config.primitives.dai, fork.config.primitives.usdc];

    // Should fail initially because the rate is not stale
    await expect(
      valueInterpreter.connect(arbitraryUser).removeStalePrimitives(primitivesToRemove),
    ).rejects.toBeRevertedWith('Rate is not stale');

    // Should succeed after warping beyond staleness threshold
    await provider.send('evm_increaseTime', [60 * 60 * 49]);
    await provider.send('evm_mine', []);
    const receipt = await valueInterpreter.connect(arbitraryUser).removeStalePrimitives(primitivesToRemove);

    // Assert that the primitive has been removed from storage, and that the correct event fired
    const events = extractEvent(receipt, 'StalePrimitiveRemoved');
    expect(events).toHaveLength(primitivesToRemove.length);
    for (let i = 0; i < primitivesToRemove.length; i++) {
      expect(await valueInterpreter.getAggregatorForPrimitive(primitivesToRemove[i])).toMatchAddress(
        constants.AddressZero,
      );
      expect(await valueInterpreter.getRateAssetForPrimitive(primitivesToRemove[i])).toBe(0);

      expect(events[i]).toMatchEventArgs({ primitive: resolveAddress(primitivesToRemove[i]) });
    }
  });
});

describe('setEthUsdAggregator', () => {
  it('properly sets eth/usd aggregator', async () => {
    const valueInterpreter = fork.deployment.valueInterpreter;
    const aggregator = fork.config.chainlink.aggregators.mln[0];

    // Get already stored ETH USD aggregator
    const storedEthUsdAggregator = await valueInterpreter.getEthUsdAggregator();

    // Update to new value
    const setEthUsdAggregatorReceipt = await valueInterpreter.setEthUsdAggregator(aggregator);

    const updatedEthUsdAggregator = await valueInterpreter.getEthUsdAggregator();
    expect(updatedEthUsdAggregator).toMatchAddress(aggregator);

    // Event should inlude the old and new ETH USD aggregators
    assertEvent(setEthUsdAggregatorReceipt, 'EthUsdAggregatorSet', {
      prevEthUsdAggregator: storedEthUsdAggregator,
      nextEthUsdAggregator: updatedEthUsdAggregator,
    });
  });

  it('reverts when setting an already set aggregator', async () => {
    const valueInterpreter = fork.deployment.valueInterpreter;

    const storedEthUsdAggregator = await valueInterpreter.getEthUsdAggregator();

    // Set the same aggregator than stored
    await expect(valueInterpreter.setEthUsdAggregator(storedEthUsdAggregator)).rejects.toBeRevertedWith(
      'Value already set',
    );
  });
});

// NOTE: Behaviour tests included under e2e tests
describe('getCanonicalRate', () => {
  it.todo('reverts when there is a negative or zero value for the base asset aggregator');

  it.todo('reverts when there is a negative or zero value for the quote asset aggregator');

  it.todo('reverts when there is a negative or zero value for the intermediary asset (ETH/USD)');

  // USDC/ETH and WETH/ETH
  it('works as expected when calling getCanonicalRate (equal rate asset)', async () => {
    const valueInterpreter = fork.deployment.valueInterpreter;
    const usdc = new StandardToken(fork.config.primitives.usdc, fork.deployer);
    const weth = new StandardToken(fork.config.weth, fork.deployer);
    const usdcAggregator = await loadPrimitiveAggregator({
      valueInterpreter,
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
    const rate = await valueInterpreter.calcCanonicalAssetValue.args(weth, wethUnit, usdc).call();
    expect(rate).toEqBigNumber(expectedRate);
  });

  // DAI/USD and USDC/ETH
  it('works as expected when calling getCanonicalRate (different rate assets)', async () => {
    const valueInterpreter = fork.deployment.valueInterpreter;
    const dai = new StandardToken(fork.config.primitives.dai, fork.deployer);
    const usdc = new StandardToken(fork.config.primitives.usdc, fork.deployer);
    const daiAggregator = await swapDaiAggregatorForUsd({
      signer: fork.deployer,
      valueInterpreter,
      dai,
    });
    const ethUSDAggregator = new IChainlinkAggregator(await valueInterpreter.getEthUsdAggregator(), provider);
    const usdcAggregator = await loadPrimitiveAggregator({
      valueInterpreter,
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
    const canonicalRateDaiUsdc = await valueInterpreter.calcCanonicalAssetValue.args(dai, daiUnit, usdc).call();

    expect(canonicalRateDaiUsdc).toEqBigNumber(expectedRateDaiUsdc);

    // ETH rate to USD rate
    // Base: usdc, quote: dai
    const expectedRateUsdcDai = usdcUnit
      .mul(usdcRate)
      .mul(ethRate)
      .div(ethUnit)
      .mul(daiUnit)
      .div(usdcUnit)
      .div(daiRate);
    const canonicalRateUsdcDai = await valueInterpreter.calcCanonicalAssetValue.args(usdc, usdcUnit, dai).call();
    expect(canonicalRateUsdcDai).toEqBigNumber(expectedRateUsdcDai);
  });
});

describe('setStaleRateThreshold', () => {
  it('does not allow its prev value', async () => {
    const valueInterpreter = fork.deployment.valueInterpreter;

    const storedStaleRateThreshold = await valueInterpreter.getStaleRateThreshold();

    await expect(valueInterpreter.setStaleRateThreshold(storedStaleRateThreshold)).rejects.toBeRevertedWith(
      'Value already set',
    );
  });

  it('properly sets value', async () => {
    const valueInterpreter = fork.deployment.valueInterpreter;

    // Get stored staleRateThreshold
    const storedStaleRateThreshold = await valueInterpreter.getStaleRateThreshold();

    // Set new value to 1 day
    const newStaleThreshold = 60 * 60 * 24;
    const setStaleRateThresholdReceipt = await valueInterpreter.setStaleRateThreshold(newStaleThreshold);

    //Check events
    const updatedStaleRateThreshold = await valueInterpreter.getStaleRateThreshold();
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
      expect(canonicalAssetValue).toEqBigNumber('1002326');
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
      expect(canonicalAssetValue).toEqBigNumber('1004177');
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

      // bnb/usd on July, 2021 was about $312
      // ren/usd on July, 2021 was about $0.32
      // Source (bnb): <https://www.coingecko.com/en/coins/binance-coin/historical_data/usd?start_date=2021-07-16&end_date=2021-07-16>
      // Source (ren): <https://www.coingecko.com/en/coins/ren/historical_data/usd?start_date=2021-07-16&end_date=2021-07-16>
      // 1 bnb was about 722 REN

      const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
        .args(bnb, utils.parseUnits('1', baseDecimals), ren)
        .call();

      expect(canonicalAssetValue).toEqBigNumber('979940887055536316777');
    });
  });

  describe('different rate asset (ETH rate -> USD rate)', () => {
    // SUSD/ETH and DAI/USD
    it('returns the expected value from the valueInterpreter (same decimals)', async () => {
      const valueInterpreter = fork.deployment.valueInterpreter;
      const dai = new StandardToken(fork.config.primitives.dai, fork.deployer);
      const susd = new StandardToken(fork.config.primitives.susd, fork.deployer);

      await swapDaiAggregatorForUsd({
        signer: fork.deployer,
        valueInterpreter,
        dai,
      });

      const baseDecimals = await susd.decimals();
      const quoteDecimals = await dai.decimals();
      expect(baseDecimals).toEqBigNumber(quoteDecimals);

      const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
        .args(susd, utils.parseUnits('1', baseDecimals), dai)
        .call();

      // Should be near 1000000000000000000 (10^18)
      expect(canonicalAssetValue).toEqBigNumber('1003798757802592790');
    });

    // USDC/ETH and DAI/USD
    it('returns the expected value from the valueInterpreter (non 18 decimals primitives)', async () => {
      const valueInterpreter = fork.deployment.valueInterpreter;
      const dai = new StandardToken(fork.config.primitives.dai, fork.deployer);
      const usdc = new StandardToken(fork.config.primitives.usdc, fork.deployer);

      await swapDaiAggregatorForUsd({
        signer: fork.deployer,
        valueInterpreter,
        dai,
      });

      const baseDecimals = await usdc.decimals();
      const quoteDecimals = await dai.decimals();
      expect(baseDecimals).not.toEqBigNumber(quoteDecimals);

      const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
        .args(usdc, utils.parseUnits('1', baseDecimals), dai)
        .call();

      // Should be near 1000000000000000000 (10^18)
      expect(canonicalAssetValue).toEqBigNumber('999623218725174672');
    });
  });

  describe('different rate asset (USD rate -> ETH rate)', () => {
    // DAI/USD and SUSD/ETH
    it('returns the expected value from the valueInterpreter (18 decimals)', async () => {
      const valueInterpreter = fork.deployment.valueInterpreter;
      const dai = new StandardToken(fork.config.primitives.dai, fork.deployer);
      const susd = new StandardToken(fork.config.primitives.susd, fork.deployer);

      await swapDaiAggregatorForUsd({
        signer: fork.deployer,
        valueInterpreter,
        dai,
      });

      const baseDecimals = await dai.decimals();
      const quoteDecimals = await susd.decimals();
      expect(baseDecimals).toEqBigNumber(quoteDecimals);

      const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
        .args(dai, utils.parseUnits('1', baseDecimals), susd)
        .call();

      // Should be near 1000000000000000000 (10^18)
      expect(canonicalAssetValue).toEqBigNumber('996215618147497394');
    });

    // DAI/USD and USDC/ETH
    it('returns the expected value from the valueInterpreter (non 18 decimals primitives)', async () => {
      const valueInterpreter = fork.deployment.valueInterpreter;
      const dai = new StandardToken(fork.config.primitives.dai, fork.deployer);
      const usdc = new StandardToken(fork.config.primitives.usdc, fork.deployer);

      await swapDaiAggregatorForUsd({
        signer: fork.deployer,
        valueInterpreter,
        dai,
      });

      const baseDecimals = await dai.decimals();
      const quoteDecimals = await usdc.decimals();
      expect(baseDecimals).not.toEqBigNumber(quoteDecimals);

      const canonicalAssetValue = await valueInterpreter.calcCanonicalAssetValue
        .args(dai, utils.parseUnits('1', baseDecimals), usdc)
        .call();

      // Should be near 1000000 (10^6)
      expect(canonicalAssetValue).toEqBigNumber('1000376');
    });
  });
});
