import { constants } from 'ethers';
import { EthereumTestnetProvider } from '@crestproject/crestproject';
import { defaultTestDeployment } from '@melonproject/testutils';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(
    provider,
  );

  return {
    accounts,
    deployment,
    config,
  };
}

describe('constructor', () => {
  it('sets initial state for library', async () => {
    const {
      deployment: {
        comptrollerLib,
        engine,
        feeManager,
        fundDeployer,
        fundLifecycleLib,
        integrationManager,
        permissionedVaultActionLib,
        policyManager,
        valueInterpreter,
      },
    } = await provider.snapshot(snapshot);

    const routesCall = comptrollerLib.getLibRoutes();
    await expect(routesCall).resolves.toMatchObject({
      feeManager_: feeManager.address,
      fundDeployer_: fundDeployer.address,
      fundLifecycleLib_: fundLifecycleLib.address,
      integrationManager_: integrationManager.address,
      permissionedVaultActionLib_: permissionedVaultActionLib.address,
      policyManager_: policyManager.address,
      valueInterpreter_: valueInterpreter.address,
    });

    const engineCall = comptrollerLib.getEngine();
    await expect(engineCall).resolves.toBe(engine.address);

    // The following should be default values

    const denominationAssetCall = comptrollerLib.getDenominationAsset();
    await expect(denominationAssetCall).resolves.toBe(constants.AddressZero);

    const vaultProxyCall = comptrollerLib.getVaultProxy();
    await expect(vaultProxyCall).resolves.toBe(constants.AddressZero);
  });
});

it.todo(
  'test that no functions can be called directly (only can be delegatecalled)',
);
