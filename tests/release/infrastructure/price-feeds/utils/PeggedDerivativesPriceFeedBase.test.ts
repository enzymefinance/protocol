import { randomAddress } from '@enzymefinance/ethers';
import { EthereumTestnetProvider } from '@enzymefinance/hardhat';
import { MockToken, TestPeggedDerivativesPriceFeed } from '@enzymefinance/protocol';
import { defaultTestDeployment } from '@enzymefinance/testutils';

async function snapshot(provider: EthereumTestnetProvider) {
  const { deployment, config } = await defaultTestDeployment(provider);

  const testPeggedDerivativesPriceFeed = await TestPeggedDerivativesPriceFeed.deploy(
    config.deployer,
    config.dispatcher,
  );

  // Deploy mock derivative and mock underlying with same decimals
  const mockDerivative = await MockToken.deploy(config.deployer, 'Mock Derivative', 'MOCK_D', 18);
  const mockUnderlying = await MockToken.deploy(config.deployer, 'Mock Underlying', 'MOCK_U', 18);

  return {
    config,
    deployment,
    mockDerivative,
    mockUnderlying,
    testPeggedDerivativesPriceFeed,
  };
}

describe('addDerivatives', () => {
  it('does not allow a derivative and underlying with unequal decimals', async () => {
    const {
      config: { deployer },
      mockDerivative,
      mockUnderlying,
      testPeggedDerivativesPriceFeed,
    } = await provider.snapshot(snapshot);

    // Should fail with an underlying that does not match the decimals of the derivative
    const mockNon18DecimalsUnderlying = await MockToken.deploy(deployer, 'Mock Underlying 2', 'MOCK_U_2', 8);
    await expect(
      testPeggedDerivativesPriceFeed.addDerivatives([mockDerivative], [mockNon18DecimalsUnderlying]),
    ).rejects.toBeRevertedWith('Unequal decimals');

    // Should succeed with a valid underlying
    await expect(
      testPeggedDerivativesPriceFeed.addDerivatives([mockDerivative], [mockUnderlying]),
    ).resolves.toBeReceipt();
  });
});

describe('calcUnderlyingValues', () => {
  it('does not allow an unsupported derivative', async () => {
    const { testPeggedDerivativesPriceFeed } = await provider.snapshot(snapshot);

    await expect(testPeggedDerivativesPriceFeed.calcUnderlyingValues(randomAddress(), 1)).rejects.toBeRevertedWith(
      'Not a supported derivative',
    );
  });

  it('correctly returns the underlying w/ _derivativeAmount 1:1', async () => {
    const { mockDerivative, mockUnderlying, testPeggedDerivativesPriceFeed } = await provider.snapshot(snapshot);

    // Add the derivative
    await testPeggedDerivativesPriceFeed.addDerivatives([mockDerivative], [mockUnderlying]);

    const derivativeAmount = 5;
    expect(
      await testPeggedDerivativesPriceFeed.calcUnderlyingValues.args(mockDerivative, derivativeAmount).call(),
    ).toMatchFunctionOutput(testPeggedDerivativesPriceFeed.calcUnderlyingValues, {
      underlyings_: [mockUnderlying],
      underlyingAmounts_: [derivativeAmount],
    });
  });
});
