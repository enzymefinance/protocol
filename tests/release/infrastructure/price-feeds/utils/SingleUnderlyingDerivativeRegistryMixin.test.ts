import { extractEvent, randomAddress } from '@enzymefinance/ethers';
import { TestSingleUnderlyingDerivativeRegistry } from '@enzymefinance/protocol';
import { deployProtocolFixture } from '@enzymefinance/testutils';
import { constants } from 'ethers';

async function snapshot() {
  const {
    deployer,
    deployment: { fundDeployer },
    accounts: [randomUser],
  } = await deployProtocolFixture();

  const testSingleUnderlyingDerivativeRegistry = await TestSingleUnderlyingDerivativeRegistry.deploy(
    deployer,
    fundDeployer,
  );

  return {
    fundDeployer,
    randomUser,
    testSingleUnderlyingDerivativeRegistry,
  };
}

describe('constructor', () => {
  it('sets initial storage vars', async () => {
    const { fundDeployer, testSingleUnderlyingDerivativeRegistry } = await provider.snapshot(snapshot);

    expect(await testSingleUnderlyingDerivativeRegistry.getFundDeployer()).toMatchAddress(fundDeployer);
  });
});

describe('addDerivatives', () => {
  it('does not allow a non-FundDeployer owner', async () => {
    const { randomUser, testSingleUnderlyingDerivativeRegistry } = await provider.snapshot(snapshot);

    await expect(
      testSingleUnderlyingDerivativeRegistry.connect(randomUser).addDerivatives([randomAddress()], [randomAddress()]),
    ).rejects.toBeRevertedWith('Only the FundDeployer owner can call this function');
  });

  it('does not allow an empty _derivatives array', async () => {
    const { testSingleUnderlyingDerivativeRegistry } = await provider.snapshot(snapshot);

    await expect(testSingleUnderlyingDerivativeRegistry.addDerivatives([], [])).rejects.toBeRevertedWith(
      'Empty _derivatives',
    );
  });

  it('does not allow unequal _derivatives and _underlyings arrays', async () => {
    const { testSingleUnderlyingDerivativeRegistry } = await provider.snapshot(snapshot);

    await expect(testSingleUnderlyingDerivativeRegistry.addDerivatives([randomAddress()], [])).rejects.toBeRevertedWith(
      'Unequal arrays',
    );
  });

  it('does not allow an empty derivative value', async () => {
    const { testSingleUnderlyingDerivativeRegistry } = await provider.snapshot(snapshot);

    await expect(
      testSingleUnderlyingDerivativeRegistry.addDerivatives([constants.AddressZero], [randomAddress()]),
    ).rejects.toBeRevertedWith('Empty derivative');
  });

  it('does not allow an empty underlying value', async () => {
    const { testSingleUnderlyingDerivativeRegistry } = await provider.snapshot(snapshot);

    await expect(
      testSingleUnderlyingDerivativeRegistry.addDerivatives([randomAddress()], [constants.AddressZero]),
    ).rejects.toBeRevertedWith('Empty underlying');
  });

  it('does not allow an already-set derivative', async () => {
    const { testSingleUnderlyingDerivativeRegistry } = await provider.snapshot(snapshot);

    const newDerivative = randomAddress();
    await testSingleUnderlyingDerivativeRegistry.addDerivatives([newDerivative], [randomAddress()]);

    await expect(
      testSingleUnderlyingDerivativeRegistry.addDerivatives([newDerivative], [randomAddress()]),
    ).rejects.toBeRevertedWith('Value already set');
  });

  it('correctly registers each derivative and emits an event for each', async () => {
    const { testSingleUnderlyingDerivativeRegistry } = await provider.snapshot(snapshot);

    const newDerivatives = [randomAddress(), randomAddress()];
    const newUnderlyings = [randomAddress(), randomAddress()];
    const receipt = await testSingleUnderlyingDerivativeRegistry.addDerivatives(newDerivatives, newUnderlyings);

    // Assert the derivatives are registered with their underlyings
    expect(await testSingleUnderlyingDerivativeRegistry.getUnderlyingForDerivative(newDerivatives[0])).toMatchAddress(
      newUnderlyings[0],
    );
    expect(await testSingleUnderlyingDerivativeRegistry.getUnderlyingForDerivative(newDerivatives[1])).toMatchAddress(
      newUnderlyings[1],
    );

    // Assert the correct events were emitted
    const events = extractEvent(receipt, 'DerivativeAdded');
    expect(events.length).toBe(2);
    expect(events[0]).toMatchEventArgs({
      derivative: newDerivatives[0],
      underlying: newUnderlyings[0],
    });

    expect(events[1]).toMatchEventArgs({
      derivative: newDerivatives[1],
      underlying: newUnderlyings[1],
    });
  });
});

describe('removeDerivatives', () => {
  it('does not allow a non-FundDeployer owner', async () => {
    const { randomUser, testSingleUnderlyingDerivativeRegistry } = await provider.snapshot(snapshot);

    await expect(
      testSingleUnderlyingDerivativeRegistry.connect(randomUser).removeDerivatives([randomAddress()]),
    ).rejects.toBeRevertedWith('Only the FundDeployer owner can call this function');
  });

  it('does not allow an empty _derivatives array', async () => {
    const { testSingleUnderlyingDerivativeRegistry } = await provider.snapshot(snapshot);

    await expect(testSingleUnderlyingDerivativeRegistry.removeDerivatives([])).rejects.toBeRevertedWith(
      'Empty _derivatives',
    );
  });

  it('does not allow an unregistered derivative', async () => {
    const { testSingleUnderlyingDerivativeRegistry } = await provider.snapshot(snapshot);

    await expect(testSingleUnderlyingDerivativeRegistry.removeDerivatives([randomAddress()])).rejects.toBeRevertedWith(
      'Value not set',
    );
  });

  it('correctly de-registers each derivative and emits an event for each', async () => {
    const { testSingleUnderlyingDerivativeRegistry } = await provider.snapshot(snapshot);

    const derivativeToKeep = randomAddress();
    const underlyingToKeep = randomAddress();
    const derivativesToRemove = [randomAddress(), randomAddress()];

    // Add the derivatives
    await testSingleUnderlyingDerivativeRegistry.addDerivatives(
      [derivativeToKeep, ...derivativesToRemove],
      [underlyingToKeep, randomAddress(), randomAddress()],
    );

    // Remove two derivatives
    const receipt = await testSingleUnderlyingDerivativeRegistry.removeDerivatives(derivativesToRemove);

    // Assert that only the specified derivatives are de-registered
    expect(
      await testSingleUnderlyingDerivativeRegistry.getUnderlyingForDerivative(derivativesToRemove[0]),
    ).toMatchAddress(constants.AddressZero);
    expect(
      await testSingleUnderlyingDerivativeRegistry.getUnderlyingForDerivative(derivativesToRemove[1]),
    ).toMatchAddress(constants.AddressZero);
    expect(await testSingleUnderlyingDerivativeRegistry.getUnderlyingForDerivative(derivativeToKeep)).toMatchAddress(
      underlyingToKeep,
    );

    // Assert the correct events were emitted
    const events = extractEvent(receipt, 'DerivativeRemoved');
    expect(events.length).toBe(2);
    expect(events[0]).toMatchEventArgs({
      derivative: derivativesToRemove[0],
    });

    expect(events[1]).toMatchEventArgs({
      derivative: derivativesToRemove[1],
    });
  });
});
