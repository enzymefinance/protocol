import { constants } from 'ethers';
import { EthereumTestnetProvider } from '@crestproject/crestproject';
import { defaultTestDeployment } from '@melonproject/testutils';

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
      deployment: {
        comptrollerLib,
        feeManager,
        fundDeployer,
        fundLifecycleLib,
        integrationManager,
        permissionedVaultActionLib,
        policyManager,
        valueInterpreter,
      },
    } = await provider.snapshot(snapshot);

    const routesCall = await comptrollerLib.getLibRoutes();
    expect(routesCall).toMatchFunctionOutput(comptrollerLib.getLibRoutes.fragment, {
      feeManager_: feeManager,
      fundDeployer_: fundDeployer,
      fundLifecycleLib_: fundLifecycleLib,
      integrationManager_: integrationManager,
      permissionedVaultActionLib_: permissionedVaultActionLib,
      policyManager_: policyManager,
      valueInterpreter_: valueInterpreter,
    });

    // The following should be default values
    const denominationAssetCall = await comptrollerLib.getDenominationAsset();
    expect(denominationAssetCall).toMatchAddress(constants.AddressZero);

    const vaultProxyCall = await comptrollerLib.getVaultProxy();
    expect(vaultProxyCall).toMatchAddress(constants.AddressZero);
  });
});

it.todo('test that no functions can be called directly (only can be delegatecalled)');
