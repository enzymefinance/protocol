import {
  EthereumTestnetProvider,
  randomAddress,
} from '@crestproject/crestproject';
import { constants } from 'ethers';
import { defaultTestDeployment } from '../../';

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
        aggregatedDerivativePriceFeed,
        chainlinkPriceFeed,
        policyManager,
        feeManager,
        integrationManager,
        valueInterpreter,
      },
    } = await provider.snapshot(snapshot);

    const routesCall = comptrollerLib.getRoutes();
    await expect(routesCall).resolves.toMatchObject({
      derivativePriceFeed_: aggregatedDerivativePriceFeed.address,
      feeManager_: feeManager.address,
      integrationManager_: integrationManager.address,
      policyManager_: policyManager.address,
      primitivePriceFeed_: chainlinkPriceFeed.address,
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

describe('init', () => {
  it('cannot be called on library', async () => {
    const {
      deployment: { comptrollerLib },
    } = await provider.snapshot(snapshot);

    const initTx = comptrollerLib.init(randomAddress(), '0x', '0x');
    await expect(initTx).rejects.toBeRevertedWith(
      'Only a delegate call can access this function',
    );
  });
});

it.todo(
  'test that no functions can be called directly (only can be delegatecalled',
);
