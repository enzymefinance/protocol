import { randomAddress } from '@enzymefinance/ethers';
import {
  AggregatedDerivativePriceFeed,
  IDerivativePriceFeed,
  IPrimitivePriceFeed,
  MockToken,
  ValueInterpreter,
} from '@enzymefinance/protocol';
import { deployProtocolFixture } from '@enzymefinance/testutils';
import { constants, utils } from 'ethers';

async function snapshot() {
  const { deployer, deployment, config } = await deployProtocolFixture();

  // Set up primitives

  // Create primitives with different decimals
  const mockPrimitive1 = await MockToken.deploy(deployer, 'Mock Primitive 1', 'MCKP001', 18);
  const mockPrimitive2 = await MockToken.deploy(deployer, 'Mock Primitive 2', 'MCKP002', 18);

  // Create mock primitive price feed
  const mockPrimitivePriceFeed = await IPrimitivePriceFeed.mock(deployer);
  await mockPrimitivePriceFeed.isSupportedAsset.returns(false);
  await mockPrimitivePriceFeed.isSupportedAsset.given(mockPrimitive1).returns(true);
  await mockPrimitivePriceFeed.isSupportedAsset.given(mockPrimitive2).returns(true);
  await mockPrimitivePriceFeed.calcCanonicalValue.returns(0, false);

  // Set up derivatives

  // Create derivative mock
  const mockDerivative = await MockToken.deploy(deployer, 'Mock Derivative 1', 'MCKD001', 18);

  // Create derivative price feed mock
  const mockDerivativePriceFeed = await IDerivativePriceFeed.mock(deployer);
  await mockDerivativePriceFeed.calcUnderlyingValues.returns([], []);

  // Create aggregated derivative price feed mock
  const mockAggregatedDerivativePriceFeed = await AggregatedDerivativePriceFeed.mock(deployer);
  await mockAggregatedDerivativePriceFeed.getPriceFeedForDerivative.returns(constants.AddressZero);
  await mockAggregatedDerivativePriceFeed.getPriceFeedForDerivative
    .given(mockDerivative)
    .returns(mockDerivativePriceFeed);

  // Deploy a new value interpreter with mock price feeds
  const valueInterpreterWithMocks = await ValueInterpreter.deploy(
    deployer,
    mockPrimitivePriceFeed,
    mockAggregatedDerivativePriceFeed,
  );

  return {
    deployment,
    mockAggregatedDerivativePriceFeed,
    mockDerivative,
    mockDerivativePriceFeed,
    mockPrimitive1,
    mockPrimitive2,
    mockPrimitivePriceFeed,
    valueInterpreterWithMocks,
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

describe('calcCanonicalAssetValue', () => {
  it('returns the correct value for a primitive base asset', async () => {
    const { mockPrimitive1, mockPrimitive2, mockPrimitivePriceFeed, valueInterpreterWithMocks } =
      await provider.snapshot(snapshot);

    // Set Primitive Price feed to return 1 quote asset unit
    await mockPrimitivePriceFeed.calcCanonicalValue
      .given(mockPrimitive1, utils.parseEther('1'), mockPrimitive2)
      .returns(utils.parseEther('1'), true);

    // Calculate the canonical asset value
    const canonicalAssetValue = await valueInterpreterWithMocks.calcCanonicalAssetValue
      .args(mockPrimitive1, utils.parseEther('1'), mockPrimitive2)
      .call();

    expect(canonicalAssetValue).toMatchFunctionOutput(valueInterpreterWithMocks.calcCanonicalAssetValue, {
      value_: utils.parseEther('1'),
      isValid_: true,
    });
  });

  it('returns the correct value for a derivative base asset', async () => {
    const {
      mockDerivative,
      mockPrimitive1,
      mockPrimitive2,
      mockDerivativePriceFeed,
      mockPrimitivePriceFeed,
      valueInterpreterWithMocks,
    } = await provider.snapshot(snapshot);

    // Set 1 unit of derivative to return amounts of mockPrimitive1 and mockPrimitive2
    const mockPrimitive1Amount = utils.parseEther('2');
    const mockPrimitive2Amount = utils.parseEther('4');
    await mockDerivativePriceFeed.calcUnderlyingValues
      .given(mockDerivative, utils.parseEther('1'))
      .returns([mockPrimitive1, mockPrimitive2], [mockPrimitive1Amount, mockPrimitive2Amount]);

    // Set primitive price feed to return the same amount of mockPrimitive1 given mockPrimitive2Amount
    await mockPrimitivePriceFeed.calcCanonicalValue
      .given(mockPrimitive2, mockPrimitive2Amount, mockPrimitive1)
      .returns(mockPrimitive2Amount, true);

    // Calculate canonical asset value for an amount of tokens
    const calculatedCanonicalAssetValue = await valueInterpreterWithMocks.calcCanonicalAssetValue
      .args(mockDerivative, utils.parseEther('1'), mockPrimitive1)
      .call();

    // Calculate expected value
    const expectedValue = mockPrimitive1Amount.add(mockPrimitive2Amount);

    expect(calculatedCanonicalAssetValue).toMatchFunctionOutput(valueInterpreterWithMocks.calcCanonicalAssetValue, {
      value_: expectedValue,
      isValid_: true,
    });
  });

  it('does not allow a derivative with an unsupported underlying asset', async () => {
    const { mockDerivative, mockPrimitive1, mockDerivativePriceFeed, valueInterpreterWithMocks } =
      await provider.snapshot(snapshot);

    const badUnderlying = randomAddress();
    await mockDerivativePriceFeed.calcUnderlyingValues
      .given(mockDerivative, 1)
      .returns([badUnderlying], [utils.parseEther('1')]);

    await expect(
      valueInterpreterWithMocks.calcCanonicalAssetValue(mockDerivative, 1, mockPrimitive1),
    ).rejects.toBeRevertedWith('Unsupported _baseAsset');
  });

  it('does not allow to get a rate from a non supported quote asset', async () => {
    const { mockPrimitive1, valueInterpreterWithMocks } = await provider.snapshot(snapshot);

    await expect(
      valueInterpreterWithMocks.calcCanonicalAssetValue(mockPrimitive1, 1, randomAddress()),
    ).rejects.toBeRevertedWith('Unsupported _quoteAsset');
  });

  it('does not allow as an input an unsupported baseAsset', async () => {
    const { mockPrimitive1, valueInterpreterWithMocks } = await provider.snapshot(snapshot);

    await expect(
      valueInterpreterWithMocks.calcCanonicalAssetValue(randomAddress(), 1, mockPrimitive1),
    ).rejects.toBeRevertedWith('Unsupported _baseAsset');
  });
});

describe('calcCanonicalAssetsTotalValue', () => {
  it('calculates total canonical value for an array of assets', async () => {
    const {
      mockDerivative,
      mockDerivativePriceFeed,
      mockPrimitive1,
      mockPrimitive2,
      mockPrimitivePriceFeed,
      valueInterpreterWithMocks,
    } = await provider.snapshot(snapshot);

    // Use 1 unit for all tokens
    const amount = utils.parseEther('1');

    // Set the primitive price feed conversion to mockPrimitive2
    const mockPrimitive2Value = utils.parseEther('2');
    await mockPrimitivePriceFeed.calcCanonicalValue
      .given(mockPrimitive2, amount, mockPrimitive1)
      .returns(mockPrimitive2Value, true);

    // Set the derivative price feed conversion to mockPrimitive1
    const mockDerivativeValue = utils.parseEther('3');
    await mockDerivativePriceFeed.calcUnderlyingValues
      .given(mockDerivative, amount)
      .returns([mockPrimitive1], [mockDerivativeValue]);

    // Calc total value of 1 unit of each token
    const calcCanonicalAssetsTotalValue = await valueInterpreterWithMocks.calcCanonicalAssetsTotalValue
      .args([mockPrimitive1, mockPrimitive2, mockDerivative], [amount, amount, amount], mockPrimitive1)
      .call();

    // Expect to have the sum of both units in base 18
    const expectedValue = amount.add(mockPrimitive2Value).add(mockDerivativeValue);
    expect(calcCanonicalAssetsTotalValue).toMatchFunctionOutput(valueInterpreterWithMocks.calcCanonicalAssetValue, {
      value_: expectedValue,
      isValid_: true,
    });
  });

  it('does not allow to input unequal argument array lengths', async () => {
    const { mockPrimitive1, valueInterpreterWithMocks } = await provider.snapshot(snapshot);

    await expect(
      valueInterpreterWithMocks.calcCanonicalAssetsTotalValue(
        [randomAddress()],
        [randomAddress(), randomAddress()],
        mockPrimitive1,
      ),
    ).rejects.toBeRevertedWith('Arrays unequal lengths');
  });
});
