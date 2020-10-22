import {
  EthereumTestnetProvider,
  randomAddress,
  resolveAddress,
} from '@crestproject/crestproject';
import { assertEvent } from '@melonproject/utils';
import { defaultTestDeployment } from '../../..';
import { releaseStatusTypes } from '../../utils';

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
  it('sets initial state', async () => {
    const {
      config: { deployer, registeredVaultCalls },
      deployment: { dispatcher, engine, fundDeployer, vaultLib },
    } = await provider.snapshot(snapshot);

    const getCreatorCall = fundDeployer.getCreator();
    await expect(getCreatorCall).resolves.toBe(await resolveAddress(deployer));

    const getDispatcherCall = fundDeployer.getDispatcher();
    await expect(getDispatcherCall).resolves.toBe(dispatcher.address);

    const getEngineCall = fundDeployer.getEngine();
    await expect(getEngineCall).resolves.toBe(engine.address);

    const getOwnerCall = fundDeployer.getOwner();
    await expect(getOwnerCall).resolves.toBe(await resolveAddress(deployer));

    const getReleaseStatusCall = fundDeployer.getReleaseStatus();
    await expect(getReleaseStatusCall).resolves.toBe(
      releaseStatusTypes.PreLaunch,
    );

    const getVaultLibCall = fundDeployer.getVaultLib();
    await expect(getVaultLibCall).resolves.toBe(vaultLib.address);

    for (const key in registeredVaultCalls.contracts) {
      const isRegisteredVaultCallCall = fundDeployer.isRegisteredVaultCall(
        registeredVaultCalls.contracts[key],
        registeredVaultCalls.selectors[key],
      );
      await expect(isRegisteredVaultCallCall).resolves.toBe(true);
    }
  });
});

describe('setComptrollerLib', () => {
  it.todo('emits ControllerLibSet event');

  it('is set during deployment and can only be set once', async () => {
    const {
      deployment: { fundDeployer, comptrollerLib },
    } = await provider.snapshot(snapshot);

    const comptrollerLibCall = fundDeployer.getComptrollerLib();
    await expect(comptrollerLibCall).resolves.toBe(comptrollerLib.address);

    const comptrollerLibTx = fundDeployer.setComptrollerLib(randomAddress());
    await expect(comptrollerLibTx).rejects.toBeRevertedWith(
      'This value can only be set once',
    );
  });
});

describe('setReleaseStatus', () => {
  it.todo('can only be called by the Dispatcher contract owner');

  it.todo('does not allow returning to PreLaunch status');

  it.todo('does not allow the current status');

  it.todo('can only be called when a comptroller lib is set');

  it('correctly handles setting the release status', async () => {
    const {
      deployment: { fundDeployer },
    } = await provider.snapshot(snapshot);

    const setReleaseStatusTx = fundDeployer.setReleaseStatus(
      releaseStatusTypes.Live,
    );
    await expect(setReleaseStatusTx).resolves.toBeReceipt();

    // Release Status should be Live
    const getReleaseStatusCall = fundDeployer.getReleaseStatus();
    await expect(getReleaseStatusCall).resolves.toBe(releaseStatusTypes.Live);

    // ReleaseStatusSet event is emitted
    await assertEvent(setReleaseStatusTx, 'ReleaseStatusSet', {
      prevStatus: releaseStatusTypes.PreLaunch,
      nextStatus: releaseStatusTypes.Live,
    });
  });
});

describe('getOwner', () => {
  it.todo('write tests for special ownership conditions of this contract');
});

describe('deregisterVaultCalls', () => {
  it.todo('write tests');
});

describe('registerVaultCalls', () => {
  it.todo('write tests');
});
