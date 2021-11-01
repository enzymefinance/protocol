import { AddressLike, extractEvent, randomAddress } from '@enzymefinance/ethers';
import { IDerivativePriceFeed, MockToken } from '@enzymefinance/protocol';
import { deployProtocolFixture } from '@enzymefinance/testutils';
import { constants } from 'ethers';

async function snapshot() {
  const {
    accounts,
    deployer,
    deployment: { compoundPriceFeed, fundDeployer, uniswapV2PoolPriceFeed, valueInterpreter },
    config,
  } = await deployProtocolFixture();

  const uniswapV2PoolTokens = config.uniswap.pools;
  const compoundTokens = config.compound.ctokens;

  const mockDerivative1 = await MockToken.deploy(deployer, 'Mock Derivative 1', 'MCKD001', 18);
  const mockDerivative2 = await MockToken.deploy(deployer, 'Mock Derivative 2', 'MCKD002', 18);

  const mockDerivativePriceFeed1 = await IDerivativePriceFeed.mock(deployer);
  await mockDerivativePriceFeed1.isSupportedAsset.returns(false);

  const mockDerivativePriceFeed2 = await IDerivativePriceFeed.mock(deployer);
  await mockDerivativePriceFeed2.isSupportedAsset.returns(false);

  return {
    accounts,
    fundDeployer,
    compoundTokens,
    uniswapV2PoolTokens,
    compoundPriceFeed,
    uniswapV2PoolPriceFeed,
    mockDerivative1,
    mockDerivative2,
    mockDerivativePriceFeed1,
    mockDerivativePriceFeed2,
    valueInterpreter,
  };
}

describe('constructor', () => {
  it('sets initial storage vars', async () => {
    const {
      valueInterpreter,
      compoundPriceFeed,
      fundDeployer,
      uniswapV2PoolPriceFeed,
      uniswapV2PoolTokens,
      compoundTokens,
    } = await provider.snapshot(snapshot);

    // Check compound
    for (const cToken of Object.values(compoundTokens) as AddressLike[]) {
      const storedPriceFeed = await valueInterpreter.getPriceFeedForDerivative(cToken);
      expect(storedPriceFeed).toMatchAddress(compoundPriceFeed);
    }

    // Check uniswapV2
    for (const lpToken of Object.values(uniswapV2PoolTokens) as AddressLike[]) {
      const storedPriceFeed = await valueInterpreter.getPriceFeedForDerivative(lpToken);
      expect(storedPriceFeed).toMatchAddress(uniswapV2PoolPriceFeed);
    }

    // TODO: add other derivatives

    // FundDeployerOwnerMixin
    expect(await valueInterpreter.getFundDeployer()).toMatchAddress(fundDeployer);
  });
});

describe('addDerivatives', () => {
  it('does not allow a random caller', async () => {
    const { accounts, valueInterpreter } = await provider.snapshot(snapshot);
    const [randomUser] = accounts;

    await expect(valueInterpreter.connect(randomUser).addDerivatives([], [])).rejects.toBeRevertedWith(
      'Only the FundDeployer owner can call this function',
    );
  });

  it('adds a set of new derivatives with price feeds', async () => {
    const { mockDerivative1, mockDerivative2, mockDerivativePriceFeed1, mockDerivativePriceFeed2, valueInterpreter } =
      await provider.snapshot(snapshot);

    // Define which asset each mock price feed supports
    await mockDerivativePriceFeed1.isSupportedAsset.given(mockDerivative1).returns(true);
    await mockDerivativePriceFeed2.isSupportedAsset.given(mockDerivative2).returns(true);

    // Add derivatives to the aggreagated price feed
    const addPriceFeedReceipt = await valueInterpreter.addDerivatives(
      [mockDerivative1, mockDerivative2],
      [mockDerivativePriceFeed1, mockDerivativePriceFeed2],
    );

    // Check correct stored price feed
    expect(await valueInterpreter.getPriceFeedForDerivative(mockDerivative1)).toMatchAddress(mockDerivativePriceFeed1);
    expect(await valueInterpreter.getPriceFeedForDerivative(mockDerivative2)).toMatchAddress(mockDerivativePriceFeed2);

    // Extract events from tx and check all of them were fired
    const events = extractEvent(addPriceFeedReceipt, 'DerivativeAdded');
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchEventArgs({
      derivative: mockDerivative1,
      priceFeed: mockDerivativePriceFeed1,
    });
    expect(events[1]).toMatchEventArgs({
      derivative: mockDerivative2,
      priceFeed: mockDerivativePriceFeed2,
    });
  });

  it('does not support adding a non supportedAsset', async () => {
    const { mockDerivative1, mockDerivativePriceFeed1, valueInterpreter } = await provider.snapshot(snapshot);

    // It should not be possible now to add this derivative
    await expect(
      valueInterpreter.addDerivatives([mockDerivative1], [mockDerivativePriceFeed1]),
    ).rejects.toBeRevertedWith('Unsupported derivative');
  });

  it('does not allow adding an already added derivative', async () => {
    const { mockDerivative1, mockDerivativePriceFeed1, valueInterpreter } = await provider.snapshot(snapshot);

    // Define which asset the mock price feed supports
    await mockDerivativePriceFeed1.isSupportedAsset.given(mockDerivative1).returns(true);

    // Add a derivative to the aggregated feed
    await valueInterpreter.addDerivatives([mockDerivative1], [mockDerivativePriceFeed1]);

    // Attempting to add the same derivative should fail
    await expect(
      valueInterpreter.addDerivatives([mockDerivative1], [mockDerivativePriceFeed1]),
    ).rejects.toBeRevertedWith('Already added');
  });

  it('does not allow different argument length as an input', async () => {
    const { valueInterpreter } = await provider.snapshot(snapshot);

    // Use arrays with length 1 and 2 to assert it reverts
    await expect(
      valueInterpreter.addDerivatives([randomAddress()], [randomAddress(), randomAddress()]),
    ).rejects.toBeRevertedWith('Unequal _derivatives and _priceFeeds array lengths');
  });
});

describe('updateDerivatives', () => {
  it('does not allow a random caller', async () => {
    const { accounts, valueInterpreter } = await provider.snapshot(snapshot);
    const [randomUser] = accounts;

    await expect(valueInterpreter.connect(randomUser).updateDerivatives([], [])).rejects.toBeRevertedWith(
      'Only the FundDeployer owner can call this function',
    );
  });

  it('happy path', async () => {
    const { valueInterpreter, mockDerivative1, mockDerivative2, mockDerivativePriceFeed1, mockDerivativePriceFeed2 } =
      await provider.snapshot(snapshot);

    // Add both derivatives to the aggregate feed using mockDerivativePriceFeed1
    await mockDerivativePriceFeed1.isSupportedAsset.given(mockDerivative1).returns(true);
    await mockDerivativePriceFeed1.isSupportedAsset.given(mockDerivative2).returns(true);
    await valueInterpreter.addDerivatives(
      [mockDerivative1, mockDerivative2],
      [mockDerivativePriceFeed1, mockDerivativePriceFeed1],
    );

    // Add both derivatives to mockDerivativePriceFeed2
    await mockDerivativePriceFeed2.isSupportedAsset.given(mockDerivative1).returns(true);
    await mockDerivativePriceFeed2.isSupportedAsset.given(mockDerivative2).returns(true);

    // Assign derivatives to mockDerivativePriceFeed2
    const updatePriceFeedReceipt = await valueInterpreter.updateDerivatives(
      [mockDerivative1, mockDerivative2],
      [mockDerivativePriceFeed2, mockDerivativePriceFeed2],
    );

    // Check the aggreagated price feed was properly updated
    expect(await valueInterpreter.getPriceFeedForDerivative(mockDerivative1)).toMatchAddress(mockDerivativePriceFeed2);
    expect(await valueInterpreter.getPriceFeedForDerivative(mockDerivative2)).toMatchAddress(mockDerivativePriceFeed2);

    // Check events were properly emitted
    const addedEvents = extractEvent(updatePriceFeedReceipt, 'DerivativeAdded');
    expect(addedEvents).toHaveLength(2);
    const removedEvents = extractEvent(updatePriceFeedReceipt, 'DerivativeRemoved');
    expect(removedEvents).toHaveLength(2);

    expect(addedEvents[0]).toMatchEventArgs({
      derivative: mockDerivative1,
      priceFeed: mockDerivativePriceFeed2,
    });
    expect(addedEvents[1]).toMatchEventArgs({
      derivative: mockDerivative2,
      priceFeed: mockDerivativePriceFeed2,
    });

    expect(removedEvents[0]).toMatchEventArgs({
      derivative: mockDerivative1,
    });
    expect(removedEvents[1]).toMatchEventArgs({
      derivative: mockDerivative2,
    });
  });
});

describe('removeDerivatives', () => {
  it('does not allow a random caller', async () => {
    const { accounts, valueInterpreter } = await provider.snapshot(snapshot);
    const [randomUser] = accounts;

    await expect(valueInterpreter.connect(randomUser).removeDerivatives([])).rejects.toBeRevertedWith(
      'Only the FundDeployer owner can call this function',
    );
  });

  it('removes a set of derivatives', async () => {
    const { valueInterpreter, mockDerivative1, mockDerivative2, mockDerivativePriceFeed1 } = await provider.snapshot(
      snapshot,
    );

    // Add both derivatives to the aggregate feed using mockDerivativePriceFeed1
    await mockDerivativePriceFeed1.isSupportedAsset.given(mockDerivative1).returns(true);
    await mockDerivativePriceFeed1.isSupportedAsset.given(mockDerivative2).returns(true);
    await valueInterpreter.addDerivatives(
      [mockDerivative1, mockDerivative2],
      [mockDerivativePriceFeed1, mockDerivativePriceFeed1],
    );

    // Add then remove the derivatives
    const removeDerivativeReceipt = await valueInterpreter.removeDerivatives([mockDerivative1, mockDerivative2]);

    // Check the derivatives are not registered anymore
    expect(await valueInterpreter.getPriceFeedForDerivative(mockDerivative1)).toMatchAddress(constants.AddressZero);
    expect(await valueInterpreter.getPriceFeedForDerivative(mockDerivative2)).toMatchAddress(constants.AddressZero);

    // Check events where properly emitted
    const events = extractEvent(removeDerivativeReceipt, 'DerivativeRemoved');
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchEventArgs({
      derivative: mockDerivative1,
    });
    expect(events[1]).toMatchEventArgs({
      derivative: mockDerivative2,
    });
  });

  it('does not allow to remove a derivative that has not been added before', async () => {
    const { valueInterpreter } = await provider.snapshot(snapshot);

    await expect(valueInterpreter.removeDerivatives([randomAddress()])).rejects.toBeRevertedWith(
      'Derivative not yet added',
    );
  });
});
