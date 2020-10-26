import {
  EthereumTestnetProvider,
  randomAddress,
  resolveAddress,
} from '@crestproject/crestproject';
import { constants } from 'ethers';
import { defaultTestDeployment } from '../../../';
import {
  createMigratedFundConfig,
  createNewFund,
  generateFeeManagerConfigWithMockFees,
  generatePolicyManagerConfigWithMockPolicies,
  releaseStatusTypes,
} from '../../utils';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(
    provider,
  );

  // Get mock fees and mock policies data with which to configure funds
  const feeManagerConfigData = await generateFeeManagerConfigWithMockFees({
    deployer: config.deployer,
    feeManager: deployment.feeManager,
  });
  const policyManagerConfigData = await generatePolicyManagerConfigWithMockPolicies(
    {
      deployer: config.deployer,
      policyManager: deployment.policyManager,
    },
  );

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

    const newFundTx = fundDeployer.createNewFund(
      constants.AddressZero,
      '',
      randomAddress(),
      0,
      constants.HashZero,
      constants.HashZero,
    );

    await expect(newFundTx).rejects.toBeRevertedWith(' _owner cannot be empty');
  });

  it('does not allow an empty _denominationAsset', async () => {
    const {
      deployment: { fundDeployer },
    } = await provider.snapshot(snapshot);

    const newFundTx = fundDeployer.createNewFund(
      randomAddress(),
      '',
      constants.AddressZero,
      0,
      constants.HashZero,
      constants.HashZero,
    );

    await expect(newFundTx).rejects.toBeRevertedWith(
      ' _denominationAsset cannot be empty',
    );
  });

  it('does not allow the release to be paused', async () => {
    const {
      deployment: {
        fundDeployer,
        tokens: { weth: denominationAsset },
      },
    } = await provider.snapshot(snapshot);

    // Pause the release
    await fundDeployer.setReleaseStatus(releaseStatusTypes.Paused);

    const newFundTx = fundDeployer.createNewFund(
      randomAddress(),
      '',
      denominationAsset,
      0,
      constants.HashZero,
      constants.HashZero,
    );
    await expect(newFundTx).rejects.toBeRevertedWith('Release is paused');
  });

  it('correctly handles valid call', async () => {
    const {
      deployment: {
        fundDeployer,
        tokens: { weth },
      },
      accounts: { 0: signer },
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
    await expect(comptrollerProxy.activate).toHaveBeenCalledOnContractWith(
      vaultProxy.address,
      false,
    );
  });

  it.todo('test that amgu is sent to the Engine in the above function');
});

describe('createMigratedFundConfig', () => {
  it('does not allow an empty _denominationAsset', async () => {
    const {
      deployment: { fundDeployer },
    } = await provider.snapshot(snapshot);

    const createMigratedFundConfigTx = fundDeployer.createMigratedFundConfig(
      constants.AddressZero,
      0,
      constants.HashZero,
      constants.HashZero,
    );

    await expect(createMigratedFundConfigTx).rejects.toBeRevertedWith(
      '_denominationAsset cannot be empty',
    );
  });

  it('does not allow the release to be paused', async () => {
    const {
      deployment: {
        fundDeployer,
        tokens: { weth: denominationAsset },
      },
    } = await provider.snapshot(snapshot);

    // Pause the release
    await fundDeployer.setReleaseStatus(releaseStatusTypes.Paused);

    const createMigratedFundConfigTx = fundDeployer.createMigratedFundConfig(
      denominationAsset,
      0,
      constants.HashZero,
      constants.HashZero,
    );
    await expect(createMigratedFundConfigTx).rejects.toBeRevertedWith(
      'Release is paused',
    );
  });

  it('correctly handles valid call', async () => {
    const {
      deployment: {
        fundDeployer,
        tokens: { weth: denominationAsset },
      },
      accounts: { 0: signer },
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
    const getPendingComptrollerProxyCreatorCall = fundDeployer.getPendingComptrollerProxyCreator(
      comptrollerProxy,
    );
    await expect(getPendingComptrollerProxyCreatorCall).resolves.toBe(
      await resolveAddress(signer),
    );

    // Assert expected calls
    expect(comptrollerProxy.activate).not.toHaveBeenCalledOnContract();
  });
});
