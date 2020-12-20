import { EthereumTestnetProvider, extractEvent, randomAddress } from '@crestproject/crestproject';
import {
  AggregatedDerivativePriceFeed,
  IDerivativePriceFeed,
  MockPrimitivePriceFeed,
  MockToken,
  ValueInterpreter,
} from '@melonproject/protocol';
import { defaultTestDeployment } from '@melonproject/testutils';
import { constants, utils } from 'ethers';

async function snapshot(provider: EthereumTestnetProvider) {
  const { deployment, config } = await defaultTestDeployment(provider);

  // Set up one derivative mock
  const derivativeMock = await MockToken.deploy(config.deployer, 'Mock Derivative 1', 'MCKD001', 18);

  // Set up primitive mocks with different decimals
  const primitiveMocks = await Promise.all([
    MockToken.deploy(config.deployer, 'Mock Primitive 1', 'MCKP001', 6),
    MockToken.deploy(config.deployer, 'Mock Primitive 2', 'MCKP002', 18),
  ]);

  // Define derivative rates relative to the primitiveMocks
  const derivativeToPrimitivesRates = [utils.parseEther('2'), utils.parseEther('4')];

  // Create derivative price feed mock
  const mockDerivativePriceFeed = await IDerivativePriceFeed.mock(config.deployer);
  await mockDerivativePriceFeed.getRatesToUnderlyings.returns([], []);
  await mockDerivativePriceFeed.getRatesToUnderlyings
    .given(derivativeMock)
    .returns(primitiveMocks, derivativeToPrimitivesRates);

  // Create aggregated derivative price feed mock
  const mockAggregatedDerivativePriceFeed = await AggregatedDerivativePriceFeed.mock(config.deployer);
  await mockAggregatedDerivativePriceFeed.getRatesToUnderlyings.returns([], []);
  await mockAggregatedDerivativePriceFeed.getRatesToUnderlyings
    .given(derivativeMock)
    .returns(primitiveMocks, derivativeToPrimitivesRates);
  await mockAggregatedDerivativePriceFeed.getPriceFeedForDerivative.returns(constants.AddressZero);
  await mockAggregatedDerivativePriceFeed.getPriceFeedForDerivative
    .given(derivativeMock)
    .returns(mockDerivativePriceFeed);

  // TODO: refactor primitive price feed to use crestproject mocks

  // Deploy mock primitive price feed
  const primitivePriceFeedMock = await MockPrimitivePriceFeed.deploy(config.deployer, primitiveMocks, 18);

  // Initialize primitiveMock rates to a unit
  await primitivePriceFeedMock.setCanonicalRate(primitiveMocks[0], primitiveMocks[1], utils.parseEther('1'), true);
  await primitivePriceFeedMock.setCanonicalRate(primitiveMocks[1], primitiveMocks[0], utils.parseEther('1'), true);

  // Deploy a new value interpreter with mock price feeds
  const valueInterpreterWithMocks = await ValueInterpreter.deploy(
    config.deployer,
    primitivePriceFeedMock,
    mockAggregatedDerivativePriceFeed,
  );

  return {
    deployment,
    mocks: {
      derivativeToPrimitivesRates,
      derivativeMock,
      primitiveMocks,
      mockAggregatedDerivativePriceFeed,
      mockDerivativePriceFeed,
      primitivePriceFeedMock,
      valueInterpreterWithMocks,
    },
    config,
  };
}

describe('constructor', () => {
  it('sets initial storage vars', async () => {
    const {
      deployment: { valueInterpreter, aggregatedDerivativePriceFeed, chainlinkPriceFeed },
    } = await provider.snapshot(snapshot);
    const aggregatedDerivativePriceFeedStored = await valueInterpreter.getAggregatedDerivativePriceFeed();
    const primitivePriceFeedStored = await valueInterpreter.getPrimitivePriceFeed();

    expect(aggregatedDerivativePriceFeedStored).toMatchAddress(aggregatedDerivativePriceFeed);
    expect(primitivePriceFeedStored).toMatchAddress(chainlinkPriceFeed);
  });
});

describe('addCachedDecimalsForAssets', () => {
  it('allows any caller, stores the correct decimals for the assets, and emits the correct event', async () => {
    const {
      config: { deployer },
      deployment: { valueInterpreter },
    } = await provider.snapshot(snapshot);

    // Define dummy tokens to add
    const dummyToken1Decimals = 18;
    const dummyToken1 = await MockToken.deploy(deployer, 'Dummy Token 1', 'DMY1', dummyToken1Decimals);
    const dummyToken2Decimals = 6;
    const dummyToken2 = await MockToken.deploy(deployer, 'Dummy Token 2', 'DMY2', dummyToken2Decimals);

    // Add the cached decimals of the dummy tokens
    const receipt = await valueInterpreter.addCachedDecimalsForAssets([dummyToken1, dummyToken2]);

    // Assert the correct decimals are stored
    expect(await valueInterpreter.getCachedDecimalsForAsset(dummyToken1)).toEqBigNumber(dummyToken1Decimals);
    expect(await valueInterpreter.getCachedDecimalsForAsset(dummyToken2)).toEqBigNumber(dummyToken2Decimals);

    // Assert the correct event was emitted per dummy token
    const events = extractEvent(receipt, 'CachedDecimalsForAssetAdded');
    expect(events.length).toBe(2);
    expect(events[0]).toMatchEventArgs({
      asset: dummyToken1,
      decimals: dummyToken1Decimals,
    });
    expect(events[1]).toMatchEventArgs({
      asset: dummyToken2,
      decimals: dummyToken2Decimals,
    });
  });
});

describe('calcLiveAssetValue', () => {
  it('returns the correct liveAssetValue for a primitive base asset (different decimals)', async () => {
    const {
      mocks: {
        primitiveMocks: [sixDecimalsBasePrimitive, eighteenDecimalsQuotePrimitive],
        primitivePriceFeedMock,
        valueInterpreterWithMocks,
      },
    } = await provider.snapshot(snapshot);

    // Use unit rate
    const rate = utils.parseEther('1');
    const isValid = true;
    await primitivePriceFeedMock.setCanonicalRate(
      sixDecimalsBasePrimitive,
      eighteenDecimalsQuotePrimitive,
      rate,
      isValid,
    );

    // Calculate live asset value for a an amount of basePrimitive
    const amount = 2;
    const liveAssetValue = await valueInterpreterWithMocks.calcLiveAssetValue
      .args(sixDecimalsBasePrimitive, amount, eighteenDecimalsQuotePrimitive)
      .call();

    // Calculated from 1e18 /1e6
    const expectedConversionRate = 1e12;
    expect(liveAssetValue).toMatchFunctionOutput(valueInterpreterWithMocks.calcLiveAssetValue, {
      value_: amount * expectedConversionRate,
      isValid_: isValid,
    });
  });

  it('returns the correct liveAssetValue for a primitive base asset (same decimals)', async () => {
    const {
      mocks: {
        primitiveMocks: [eighteenDecimalsPrimitive],
        primitivePriceFeedMock,
        valueInterpreterWithMocks,
      },
    } = await provider.snapshot(snapshot);

    // Calculate values with two eighteen decimals tokens, rate 1
    const rate = utils.parseEther('1');
    await primitivePriceFeedMock.setCanonicalRate(eighteenDecimalsPrimitive, eighteenDecimalsPrimitive, rate, true);

    const amount = utils.parseEther('2');
    const calculatedLiveAssetValue = await valueInterpreterWithMocks.calcLiveAssetValue
      .args(eighteenDecimalsPrimitive, amount, eighteenDecimalsPrimitive)
      .call();

    expect(calculatedLiveAssetValue).toMatchFunctionOutput(valueInterpreterWithMocks.calcLiveAssetValue, {
      value_: amount,
      isValid_: true,
    });
  });

  it('returns the correct liveAssetValue for a derivative base asset (different decimals)', async () => {
    const {
      mocks: {
        derivativeToPrimitivesRates: [sixDecimalsPrimitiveRate, eighteenDecimalsPrimitiveRate],
        derivativeMock,
        primitiveMocks: [sixDecimalsQuotePrimitive],
        valueInterpreterWithMocks,
      },
    } = await provider.snapshot(snapshot);

    // Calculate canonical asset value for an amount of tokens
    const amount = utils.parseEther('2');
    const calculatedLiveAssetValue = await valueInterpreterWithMocks.calcLiveAssetValue
      .args(derivativeMock, amount, sixDecimalsQuotePrimitive)
      .call();

    // Calculate expected value
    const expectedValue = amount
      .mul(sixDecimalsPrimitiveRate)
      .add(amount.mul(eighteenDecimalsPrimitiveRate))
      .div(utils.parseEther('1'));

    // Normalize to 10e6 and assert value
    const normalizedValue = expectedValue.div(1e12);
    expect(calculatedLiveAssetValue).toMatchFunctionOutput(valueInterpreterWithMocks.calcLiveAssetValue, {
      value_: normalizedValue,
      isValid_: true,
    });
  });

  it('returns the correct liveAssetValue for a derivative base asset (same decimals)', async () => {
    const {
      mocks: {
        derivativeToPrimitivesRates: [sixDecimalsPrimitiveRate, eighteenDecimalsPrimitiveRate],
        derivativeMock,
        primitiveMocks: [, eighteenDecimalsQuotePrimitive],
        valueInterpreterWithMocks,
      },
    } = await provider.snapshot(snapshot);

    // Calculate canonical asset value for an amount of tokens
    const amount = utils.parseEther('2');
    const calculatedLiveAssetValue = await valueInterpreterWithMocks.calcLiveAssetValue
      .args(derivativeMock, amount, eighteenDecimalsQuotePrimitive)
      .call();

    // Calculate expected value
    const expectedValue = amount
      .mul(sixDecimalsPrimitiveRate)
      .add(amount.mul(eighteenDecimalsPrimitiveRate))
      .div(utils.parseEther('1'));

    expect(calculatedLiveAssetValue).toMatchFunctionOutput(valueInterpreterWithMocks.calcLiveAssetValue, {
      value_: expectedValue,
      isValid_: true,
    });
  });

  it('does not allow to call liveAssetValue with an unsupported underlying asset', async () => {
    const {
      config: { deployer },
      mocks: {
        mockDerivativePriceFeed,
        derivativeMock: baseDerivative,
        primitiveMocks: [quotePrimitive],
        valueInterpreterWithMocks,
      },
    } = await provider.snapshot(snapshot);

    const badUnderlying = await MockToken.deploy(deployer, 'Bad Underlying', 'BAD', 18);
    await mockDerivativePriceFeed.getRatesToUnderlyings
      .given(baseDerivative)
      .returns([badUnderlying], [utils.parseEther('1')]);

    await expect(
      valueInterpreterWithMocks.calcLiveAssetValue(baseDerivative, 1, quotePrimitive),
    ).rejects.toBeRevertedWith('Unsupported _baseAsset');
  });

  it('does not allow to get a rate from a non supported quote asset', async () => {
    const {
      mocks: {
        primitiveMocks: [basePrimitive, quotePrimitive],
        primitivePriceFeedMock,
        valueInterpreterWithMocks,
      },
    } = await provider.snapshot(snapshot);

    // Set supportedAsset to false and calculateLiveAssetValue
    await primitivePriceFeedMock.setIsSupportedAsset(quotePrimitive, false);
    await expect(
      valueInterpreterWithMocks.calcLiveAssetValue(basePrimitive, 1, quotePrimitive),
    ).rejects.toBeRevertedWith('Unsupported _quoteAsset');
  });

  it('does not allow as an input an unsupported baseAsset', async () => {
    const {
      mocks: {
        primitiveMocks: [quotePrimitive],
        valueInterpreterWithMocks,
      },
    } = await provider.snapshot(snapshot);

    await expect(
      valueInterpreterWithMocks.calcLiveAssetValue(randomAddress(), 1, quotePrimitive),
    ).rejects.toBeRevertedWith('Unsupported _baseAsset');
  });
});

describe('calcLiveAssetsTotalValue', () => {
  it('calculates total canonical value for an array of assets', async () => {
    const {
      mocks: {
        primitiveMocks: [sixDecimalsPrimitive, eighteenDecimalsPrimitive],
        primitivePriceFeedMock,
        valueInterpreterWithMocks,
      },
    } = await provider.snapshot(snapshot);

    // Calculate values with two eighteen decimals tokens, rate 1
    const rate = utils.parseEther('1');
    await primitivePriceFeedMock.setCanonicalRate(eighteenDecimalsPrimitive, eighteenDecimalsPrimitive, rate, true);

    // Add one units of assets in their respective decimals
    const amounts = [utils.parseUnits('1', 6), utils.parseEther('1')];
    const calcLiveAssetsTotalValue = await valueInterpreterWithMocks.calcLiveAssetsTotalValue
      .args([sixDecimalsPrimitive, eighteenDecimalsPrimitive], amounts, eighteenDecimalsPrimitive)
      .call();

    // Expect to have the sum of both units in base 18
    const expectedValue = utils.parseEther('2');
    expect(calcLiveAssetsTotalValue).toMatchFunctionOutput(valueInterpreterWithMocks.calcLiveAssetValue, {
      value_: expectedValue,
      isValid_: true,
    });
  });

  it('does not allow to input unequal argument array lengths', async () => {
    const {
      mocks: {
        primitiveMocks: [eighteenDecimalsPrimitive],
        valueInterpreterWithMocks,
      },
    } = await provider.snapshot(snapshot);

    await expect(
      valueInterpreterWithMocks.calcLiveAssetsTotalValue(
        [randomAddress()],
        [randomAddress(), randomAddress()],
        eighteenDecimalsPrimitive,
      ),
    ).rejects.toBeRevertedWith('Arrays unequal lengths');
  });
});
