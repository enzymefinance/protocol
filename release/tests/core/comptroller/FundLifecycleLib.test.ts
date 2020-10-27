import {
  EthereumTestnetProvider,
  randomAddress,
} from '@crestproject/crestproject';
import { defaultTestDeployment } from '../../../';

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
        chainlinkPriceFeed,
        feeManager,
        fundDeployer,
        fundLifecycleLib,
        integrationManager,
        policyManager,
      },
    } = await provider.snapshot(snapshot);

    const routesCall = fundLifecycleLib.getLibRoutes();
    await expect(routesCall).resolves.toMatchObject({
      feeManager_: feeManager.address,
      fundDeployer_: fundDeployer.address,
      integrationManager_: integrationManager.address,
      policyManager_: policyManager.address,
      primitivePriceFeed_: chainlinkPriceFeed.address,
    });
  });
});

describe('init', () => {
  it('cannot be called on library', async () => {
    const {
      deployment: { fundLifecycleLib },
    } = await provider.snapshot(snapshot);

    const initTx = fundLifecycleLib.init(randomAddress(), 0, '0x', '0x');
    await expect(initTx).rejects.toBeRevertedWith('Only delegate callable');
  });
});
