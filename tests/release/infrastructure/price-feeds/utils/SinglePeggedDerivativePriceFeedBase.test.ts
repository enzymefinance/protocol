import { randomAddress } from '@enzymefinance/ethers';
import { EthereumTestnetProvider } from '@enzymefinance/hardhat';
import { MockToken, TestSinglePeggedDerivativePriceFeed } from '@enzymefinance/protocol';
import { defaultTestDeployment } from '@enzymefinance/testutils';

async function snapshot(provider: EthereumTestnetProvider) {
  const { deployment, config } = await defaultTestDeployment(provider);

  // Deploy mock derivative and mock underlying with same decimals
  const mockDerivative = await MockToken.deploy(config.deployer, 'Mock Derivative', 'MOCK_D', 18);
  const mockUnderlying = await MockToken.deploy(config.deployer, 'Mock Underlying', 'MOCK_U', 18);

  const testSinglePeggedDerivativePriceFeed = await TestSinglePeggedDerivativePriceFeed.deploy(
    config.deployer,
    mockDerivative,
    mockUnderlying,
  );

  return {
    config,
    deployment,
    mockDerivative,
    mockUnderlying,
    testSinglePeggedDerivativePriceFeed,
  };
}

describe('constructor', () => {
  it('sets initial values', async () => {
    const { mockDerivative, mockUnderlying, testSinglePeggedDerivativePriceFeed } = await provider.snapshot(snapshot);

    expect(await testSinglePeggedDerivativePriceFeed.getDerivative()).toMatchAddress(mockDerivative);
    expect(await testSinglePeggedDerivativePriceFeed.getUnderlying()).toMatchAddress(mockUnderlying);
  });

  it('does not allow a derivative and underlying with different decimals', async () => {
    const {
      config: { deployer },
      mockDerivative,
    } = await provider.snapshot(snapshot);

    const mockNon18DecimalsUnderlying = await MockToken.deploy(deployer, 'Mock Underlying 2', 'MOCK_U_2', 8);

    await expect(
      TestSinglePeggedDerivativePriceFeed.deploy(deployer, mockDerivative, mockNon18DecimalsUnderlying),
    ).rejects.toBeRevertedWith('Unequal decimals');
  });
});

describe('calcUnderlyingValues', () => {
  it('does not allow an unsupported derivative', async () => {
    const { testSinglePeggedDerivativePriceFeed } = await provider.snapshot(snapshot);

    await expect(testSinglePeggedDerivativePriceFeed.calcUnderlyingValues(randomAddress(), 1)).rejects.toBeRevertedWith(
      'Not a supported derivative',
    );
  });

  it('correctly returns the underlying w/ _derivativeAmount 1:1', async () => {
    const { mockDerivative, mockUnderlying, testSinglePeggedDerivativePriceFeed } = await provider.snapshot(snapshot);

    const derivativeAmount = 5;
    expect(
      await testSinglePeggedDerivativePriceFeed.calcUnderlyingValues.args(mockDerivative, derivativeAmount).call(),
    ).toMatchFunctionOutput(testSinglePeggedDerivativePriceFeed.calcUnderlyingValues, {
      underlyings_: [mockUnderlying],
      underlyingAmounts_: [derivativeAmount],
    });
  });
});
