import { EthereumTestnetProvider, extractEvent, randomAddress } from '@crestproject/crestproject';
import { MockDerivativePriceFeed, MockToken } from '@melonproject/protocol';
import { defaultTestDeployment } from '@melonproject/testutils';
import { constants, utils } from 'ethers';

async function snapshot(provider: EthereumTestnetProvider) {
  const { deployment, config } = await defaultTestDeployment(provider);

  const derivativeMocks = await Promise.all([
    MockToken.deploy(config.deployer, 'Mock Derivative 1', 'MCKD001', 18),
    MockToken.deploy(config.deployer, 'Mock Derivative 2', 'MCKD002', 18),
  ]);

  const underlyingMocks = await Promise.all([
    MockToken.deploy(config.deployer, 'Mock Underlying 1', 'MCKU001', 18),
    MockToken.deploy(config.deployer, 'Mock Underlying 2', 'MCKU002', 18),
  ]);

  const priceFeedMocks = await Promise.all([
    MockDerivativePriceFeed.deploy(config.deployer, derivativeMocks),
    MockDerivativePriceFeed.deploy(config.deployer, derivativeMocks),
  ]);

  return {
    deployment,
    mocks: { derivativeMocks, underlyingMocks, priceFeedMocks },
    config,
  };
}

describe('constructor', () => {
  it('sets initial storage vars', async () => {
    const {
      deployment: { aggregatedDerivativePriceFeed, chaiPriceFeed, compoundPriceFeed, uniswapV2PoolPriceFeed },
      config: {
        derivatives: { chai, compound, uniswapV2 },
      },
    } = await provider.snapshot(snapshot);

    // Check chai
    const storedPriceFeed = await aggregatedDerivativePriceFeed.getPriceFeedForDerivative(chai);
    expect(storedPriceFeed).toMatchAddress(chaiPriceFeed);

    // Check compound
    const compoundTokens = Object.values(compound);
    for (const cToken of compoundTokens) {
      const storedPriceFeed = await aggregatedDerivativePriceFeed.getPriceFeedForDerivative(cToken);
      expect(storedPriceFeed).toMatchAddress(compoundPriceFeed);
    }

    // Check uniswapV2
    const uniswapTokens = Object.values(uniswapV2);
    for (const lpToken of uniswapTokens) {
      const storedPriceFeed = await aggregatedDerivativePriceFeed.getPriceFeedForDerivative(lpToken);
      expect(storedPriceFeed).toMatchAddress(uniswapV2PoolPriceFeed);
    }
  });
});

describe('addDerivatives', () => {
  it('adds a set of new derivatives with price feeds', async () => {
    const {
      mocks: { derivativeMocks, priceFeedMocks },
      deployment: { aggregatedDerivativePriceFeed },
    } = await provider.snapshot(snapshot);

    // Add derivative
    const addPriceFeedReceipt = await aggregatedDerivativePriceFeed.addDerivatives(derivativeMocks, priceFeedMocks);

    // Check correct stored price feed
    const storedPriceFeed = await aggregatedDerivativePriceFeed.getPriceFeedForDerivative(derivativeMocks[0]);
    expect(storedPriceFeed).toMatchAddress(priceFeedMocks[0]);

    // Extract events from tx and check all of them were fired
    const events = extractEvent(addPriceFeedReceipt, 'DerivativeAdded');
    expect(events).toHaveLength(derivativeMocks.length);

    for (const index in events) {
      expect(events[index]).toMatchEventArgs({
        derivative: derivativeMocks[index],
        priceFeed: priceFeedMocks[index],
      });
    }
  });

  it('does not support adding a non supportedAsset', async () => {
    const {
      mocks: {
        derivativeMocks: [derivativeMock],
        priceFeedMocks: [priceFeedMock],
      },
      deployment: { aggregatedDerivativePriceFeed },
    } = await provider.snapshot(snapshot);

    // Remove support for `MockDerivativeOne` from `PriceFeedOne`
    await priceFeedMock.setIsSupportedAsset(derivativeMock, false);

    // It should not be possible now to add this derivative
    await expect(
      aggregatedDerivativePriceFeed.addDerivatives([derivativeMock], [priceFeedMock]),
    ).rejects.toBeRevertedWith('Unsupported derivative');
  });

  it('does not allow adding an already added derivative', async () => {
    const {
      mocks: { derivativeMocks, priceFeedMocks },
      deployment: { aggregatedDerivativePriceFeed },
    } = await provider.snapshot(snapshot);

    // Add whitelisted derivatives and their price feeds
    await aggregatedDerivativePriceFeed.addDerivatives(derivativeMocks, priceFeedMocks);

    // Add the same derivatives/price feeds
    await expect(
      aggregatedDerivativePriceFeed.addDerivatives(derivativeMocks, priceFeedMocks),
    ).rejects.toBeRevertedWith('Already added');
  });

  it('does not allow an empty list of derivatives', async () => {
    const {
      mocks: { priceFeedMocks },
      deployment: { aggregatedDerivativePriceFeed },
    } = await provider.snapshot(snapshot);

    await expect(aggregatedDerivativePriceFeed.addDerivatives([], priceFeedMocks)).rejects.toBeRevertedWith(
      '_derivatives cannot be empty',
    );
  });

  it('does not allow an empty array of derivatives', async () => {
    const {
      mocks: {
        priceFeedMocks: [priceFeedMock],
      },
      deployment: { aggregatedDerivativePriceFeed },
    } = await provider.snapshot(snapshot);

    await priceFeedMock.setIsSupportedAsset(constants.AddressZero, true);

    await expect(
      aggregatedDerivativePriceFeed.addDerivatives([constants.AddressZero], [priceFeedMock]),
    ).rejects.toBeRevertedWith('Empty _derivative');
  });

  it('does not allow different argument length as an input', async () => {
    const {
      deployment: { aggregatedDerivativePriceFeed },
    } = await provider.snapshot(snapshot);

    // Use arrays with length 1 and 2 to assert it reverts
    await expect(
      aggregatedDerivativePriceFeed.addDerivatives([randomAddress()], [randomAddress(), randomAddress()]),
    ).rejects.toBeRevertedWith('Unequal _derivatives and _priceFeeds array lengths');
  });
});

describe('updateDerivatives', () => {
  it('updates a set of derivatives to new price feeds', async () => {
    const {
      config: { deployer },
      mocks: { derivativeMocks, priceFeedMocks },
      deployment: { aggregatedDerivativePriceFeed },
    } = await provider.snapshot(snapshot);

    // Start by adding the initial mock price feeds
    await aggregatedDerivativePriceFeed.addDerivatives(derivativeMocks, priceFeedMocks);

    // Create new price feed mocks to include update derivative values
    const newPriceFeedMocks = await Promise.all([
      MockDerivativePriceFeed.deploy(deployer, derivativeMocks),
      MockDerivativePriceFeed.deploy(deployer, derivativeMocks),
    ]);

    // Assign derivatives to recently created price feeds
    const updatePriceFeedReceipt = await aggregatedDerivativePriceFeed.updateDerivatives(
      derivativeMocks,
      newPriceFeedMocks,
    );

    // Check the price feed was properly updated to those derivatives
    const updatedPriceFeed = await aggregatedDerivativePriceFeed.getPriceFeedForDerivative(derivativeMocks[0]);
    expect(updatedPriceFeed).toMatchAddress(newPriceFeedMocks[0]);

    // Check events were properly emitted
    const events = extractEvent(updatePriceFeedReceipt, 'DerivativeUpdated');
    expect(events).toHaveLength(newPriceFeedMocks.length);

    for (const index in events) {
      expect(events[index]).toMatchEventArgs({
        derivative: derivativeMocks[index],
        prevPriceFeed: priceFeedMocks[index],
        nextPriceFeed: newPriceFeedMocks[index],
      });
    }
  });

  it('does not allow an empty array of derivatives', async () => {
    const {
      mocks: { priceFeedMocks },
      deployment: { aggregatedDerivativePriceFeed },
    } = await provider.snapshot(snapshot);

    await expect(aggregatedDerivativePriceFeed.updateDerivatives([], [priceFeedMocks[1]])).rejects.toBeRevertedWith(
      '_derivatives cannot be empty',
    );
  });

  it('does not allow different argument length as an input', async () => {
    const {
      deployment: { aggregatedDerivativePriceFeed },
    } = await provider.snapshot(snapshot);

    // Call updateDerivatives with array lengths of 1 and 2
    await expect(
      aggregatedDerivativePriceFeed.updateDerivatives([randomAddress()], [randomAddress(), randomAddress()]),
    ).rejects.toBeRevertedWith('Unequal _derivatives and _priceFeeds array lengths');
  });

  it('does not allow a non added derivative address as an input', async () => {
    const {
      mocks: { priceFeedMocks },
      deployment: { aggregatedDerivativePriceFeed },
    } = await provider.snapshot(snapshot);

    await expect(
      aggregatedDerivativePriceFeed.updateDerivatives([randomAddress()], [priceFeedMocks[1]]),
    ).rejects.toBeRevertedWith('Derivative not yet added');
  });

  it('does not allow to update to an already set value', async () => {
    const {
      mocks: { derivativeMocks, priceFeedMocks },
      deployment: { aggregatedDerivativePriceFeed },
    } = await provider.snapshot(snapshot);

    // Add whitelisted derivatives and their price feeds
    await aggregatedDerivativePriceFeed.addDerivatives(derivativeMocks, priceFeedMocks);

    // Add the same derivatives/price feeds
    await expect(
      aggregatedDerivativePriceFeed.updateDerivatives(derivativeMocks, priceFeedMocks),
    ).rejects.toBeRevertedWith('Value already set');
  });
});

describe('removeDerivatives', () => {
  it('updates a set of derivatives to new price feeds', async () => {
    const {
      mocks: { derivativeMocks, priceFeedMocks },
      deployment: { aggregatedDerivativePriceFeed },
    } = await provider.snapshot(snapshot);

    // Add then remove the derivatives
    await aggregatedDerivativePriceFeed.addDerivatives(derivativeMocks, priceFeedMocks);
    const removeDerivativeReceipt = await aggregatedDerivativePriceFeed.removeDerivatives(derivativeMocks);

    // Check the derivative is not anymore added
    const updatedPriceFeed = await aggregatedDerivativePriceFeed.getPriceFeedForDerivative(derivativeMocks[0]);
    expect(updatedPriceFeed).toMatchAddress(constants.AddressZero);

    // Check events where properly emitted
    const events = extractEvent(removeDerivativeReceipt, 'DerivativeRemoved');
    expect(events).toHaveLength(derivativeMocks.length);

    for (const index in events) {
      expect(events[index]).toMatchEventArgs({
        derivative: derivativeMocks[index],
      });
    }
  });

  it('does not allow to remove a derivative that has not been added before', async () => {
    const {
      deployment: { aggregatedDerivativePriceFeed },
    } = await provider.snapshot(snapshot);

    await expect(aggregatedDerivativePriceFeed.removeDerivatives([randomAddress()])).rejects.toBeRevertedWith(
      'Derivative not yet added',
    );
  });

  it('does not allow an empty array of derivatives', async () => {
    const {
      deployment: { aggregatedDerivativePriceFeed },
    } = await provider.snapshot(snapshot);

    await expect(aggregatedDerivativePriceFeed.removeDerivatives([])).rejects.toBeRevertedWith(
      '_derivatives cannot be empty',
    );
  });
});

describe('getRatesToUnderlyings', () => {
  it('properly receives the rate of a selected derivative', async () => {
    const {
      mocks: {
        derivativeMocks: [derivativeMockOne, derivativeMockTwo],
        priceFeedMocks: [priceFeedMockOne, priceFeedMockTwo],
        underlyingMocks,
      },
      deployment: { aggregatedDerivativePriceFeed },
    } = await provider.snapshot(snapshot);
    // Add derivatives
    await aggregatedDerivativePriceFeed.addDerivatives(
      [derivativeMockOne, derivativeMockTwo],
      [priceFeedMockOne, priceFeedMockTwo],
    );

    // For the first derivative, [1e18, 2e18] rates to two underlyings
    const rates = [utils.parseEther('1'), utils.parseEther('2')];
    await priceFeedMockOne.setRatesToUnderlyings(derivativeMockOne, rates, underlyingMocks);

    const ratesToUnderlyings = await aggregatedDerivativePriceFeed.getRatesToUnderlyings.args(derivativeMockOne).call();

    // Check the rateToUnderlyings match the previously updated rates
    expect(ratesToUnderlyings).toMatchFunctionOutput(aggregatedDerivativePriceFeed.getRatesToUnderlyings, {
      rates_: rates,
      underlyings_: underlyingMocks,
    });
  });

  it('does not allow to get a rate from an unsupported derivative', async () => {
    const {
      mocks: {
        derivativeMocks: [derivativeMock],
      },
      deployment: { aggregatedDerivativePriceFeed },
    } = await provider.snapshot(snapshot);

    await expect(aggregatedDerivativePriceFeed.getRatesToUnderlyings(derivativeMock)).rejects.toBeRevertedWith(
      '_derivative is not supported',
    );
  });
});
