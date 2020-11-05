import { EthereumTestnetProvider, randomAddress } from '@crestproject/crestproject';
import { constants } from 'ethers';
import {
  defaultTestDeployment,
  createMigratedFundConfig,
  createNewFund,
  generateFeeManagerConfigWithMockFees,
  generatePolicyManagerConfigWithMockPolicies,
} from '@melonproject/testutils';
import { ReleaseStatusTypes } from '@melonproject/protocol';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(provider);

  // Get mock fees and mock policies data with which to configure funds
  const feeManagerConfigData = await generateFeeManagerConfigWithMockFees({
    deployer: config.deployer,
    feeManager: deployment.feeManager,
  });

  const policyManagerConfigData = await generatePolicyManagerConfigWithMockPolicies({
    deployer: config.deployer,
    policyManager: deployment.policyManager,
  });

  return {
    accounts,
    deployment,
    config,
    feeManagerConfigData,
    policyManagerConfigData,
  };
}

describe('createNewFund', () => {
  it('does not allow an empty _fundOwner', async () => {
    const {
      deployment: { fundDeployer },
    } = await provider.snapshot(snapshot);

    await expect(
      fundDeployer.createNewFund(
        constants.AddressZero,
        '',
        randomAddress(),
        0,
        [],
        constants.HashZero,
        constants.HashZero,
      ),
    ).rejects.toBeRevertedWith(' _owner cannot be empty');
  });

  it('does not allow an empty _denominationAsset', async () => {
    const {
      deployment: { fundDeployer },
    } = await provider.snapshot(snapshot);

    await expect(
      fundDeployer.createNewFund(
        randomAddress(),
        '',
        constants.AddressZero,
        0,
        [],
        constants.HashZero,
        constants.HashZero,
      ),
    ).rejects.toBeRevertedWith(' _denominationAsset cannot be empty');
  });

  it('does not allow the release to be paused', async () => {
    const {
      deployment: {
        fundDeployer,
        tokens: { weth: denominationAsset },
      },
    } = await provider.snapshot(snapshot);

    // Pause the release
    await fundDeployer.setReleaseStatus(ReleaseStatusTypes.Paused);

    await expect(
      fundDeployer.createNewFund(randomAddress(), '', denominationAsset, 0, [], constants.HashZero, constants.HashZero),
    ).rejects.toBeRevertedWith('Release is paused');
  });

  it('correctly handles valid call', async () => {
    const {
      deployment: {
        fundDeployer,
        tokens: { weth },
      },
      accounts: [signer],
    } = await provider.snapshot(snapshot);

    const fundOwner = randomAddress();
    const fundName = 'My Fund';
    const denominationAsset = weth;

    // TODO: Fix this. Gets the wrong return values for the newly deployed contracts.
    // Get expected return values via .call() before executing tx
    // const createNewFundCall = fundDeployer.createNewFund
    //   .args(fundOwner, fundName, denominationAsset, '0x', '0x')
    //   .call();

    // Send tx. Events are asserted within helper.
    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer,
      fundDeployer,
      fundOwner,
      fundName,
      denominationAsset,
    });

    // Assert return values
    // await expect(createNewFundCall).resolves.toMatchObject([
    //   comptrollerProxy.address,
    //   vaultProxy.address,
    // ]);

    // Assert expected calls
    expect(comptrollerProxy.activate).toHaveBeenCalledOnContractWith(vaultProxy, false);
  });
});

describe('createMigratedFundConfig', () => {
  it('does not allow an empty _denominationAsset', async () => {
    const {
      deployment: { fundDeployer },
    } = await provider.snapshot(snapshot);

    await expect(
      fundDeployer.createMigratedFundConfig(constants.AddressZero, 0, [], constants.HashZero, constants.HashZero),
    ).rejects.toBeRevertedWith('_denominationAsset cannot be empty');
  });

  it('does not allow the release to be paused', async () => {
    const {
      deployment: {
        fundDeployer,
        tokens: { weth: denominationAsset },
      },
    } = await provider.snapshot(snapshot);

    // Pause the release
    await fundDeployer.setReleaseStatus(ReleaseStatusTypes.Paused);

    await expect(
      fundDeployer.createMigratedFundConfig(denominationAsset, 0, [], constants.HashZero, constants.HashZero),
    ).rejects.toBeRevertedWith('Release is paused');
  });

  it('correctly handles valid call', async () => {
    const {
      deployment: {
        fundDeployer,
        tokens: { weth: denominationAsset },
      },
      accounts: [signer],
      feeManagerConfigData,
      policyManagerConfigData,
    } = await provider.snapshot(snapshot);

    // TODO: Call first to check return value and assert below (after resolved above)

    // Send tx. Events are validated in the helper
    const { comptrollerProxy } = await createMigratedFundConfig({
      signer,
      fundDeployer,
      denominationAsset,
      feeManagerConfigData,
      policyManagerConfigData,
    });

    // Assert FundDeployer state has been set
    const getPendingComptrollerProxyCreatorCall = await fundDeployer.getPendingComptrollerProxyCreator(
      comptrollerProxy,
    );

    expect(getPendingComptrollerProxyCreatorCall).toMatchAddress(signer);

    // Assert expected calls
    expect(comptrollerProxy.activate).not.toHaveBeenCalledOnContract();
  });
});
