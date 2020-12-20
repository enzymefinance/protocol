import { constants } from 'ethers';
import { EthereumTestnetProvider, randomAddress } from '@crestproject/crestproject';
import { defaultTestDeployment } from '@melonproject/testutils';
import { ComptrollerLib } from '@melonproject/protocol';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(provider);

  return {
    accounts,
    deployment,
    config,
  };
}

describe('constructor', () => {
  it('sets initial state for library', async () => {
    const {
      config: {
        integratees: { synthetix },
      },
      deployment: {
        comptrollerLib,
        dispatcher,
        feeManager,
        fundDeployer,
        fundLifecycleLib,
        integrationManager,
        permissionedVaultActionLib,
        policyManager,
        synthetixPriceFeed,
        valueInterpreter,
      },
    } = await provider.snapshot(snapshot);

    const routesCall = await comptrollerLib.getLibRoutes();
    expect(routesCall).toMatchFunctionOutput(comptrollerLib.getLibRoutes, {
      dispatcher_: dispatcher,
      feeManager_: feeManager,
      fundDeployer_: fundDeployer,
      fundLifecycleLib_: fundLifecycleLib,
      integrationManager_: integrationManager,
      permissionedVaultActionLib_: permissionedVaultActionLib,
      policyManager_: policyManager,
      valueInterpreter_: valueInterpreter,
    });

    const getSynthetixAddressResolverCall = await comptrollerLib.getSynthetixAddressResolver();
    expect(getSynthetixAddressResolverCall).toMatchAddress(synthetix.addressResolver);

    const getSynthetixPriceFeedCall = await comptrollerLib.getSynthetixPriceFeed();
    expect(getSynthetixPriceFeedCall).toMatchAddress(synthetixPriceFeed);

    // The following should be default values
    const denominationAssetCall = await comptrollerLib.getDenominationAsset();
    expect(denominationAssetCall).toMatchAddress(constants.AddressZero);

    const vaultProxyCall = await comptrollerLib.getVaultProxy();
    expect(vaultProxyCall).toMatchAddress(constants.AddressZero);
  });
});

describe('destruct', () => {
  it('cannot be non-delegatecalled on ComptrollerLib or FundLifecycleLib', async () => {
    const {
      accounts: [fundDeployerSigner],
      config: { deployer },
      deployment: { fundLifecycleLib },
    } = await provider.snapshot(snapshot);

    const comptrollerLib = await ComptrollerLib.deploy(
      deployer,
      randomAddress(),
      fundDeployerSigner,
      randomAddress(),
      randomAddress(),
      randomAddress(),
      randomAddress(),
      fundLifecycleLib,
      randomAddress(),
      randomAddress(),
      randomAddress(),
    );

    // Calling the ComptrollerLib directly should fail
    await expect(comptrollerLib.connect(fundDeployerSigner).destruct()).rejects.toBeRevertedWith(
      'Only FundDeployer callable',
    );

    // Calling the FundLifecycleLib directly should fail
    await expect(fundLifecycleLib.connect(fundDeployerSigner).destruct()).rejects.toBeRevertedWith(
      'Only FundDeployer callable',
    );
  });
});
