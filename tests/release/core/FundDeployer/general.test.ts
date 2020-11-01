import {
  EthereumTestnetProvider,
  randomAddress,
} from '@crestproject/crestproject';
import { ReleaseStatusTypes } from '@melonproject/protocol';
import { assertEvent, defaultTestDeployment } from '@melonproject/testutils';

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

    const getCreatorCall = await fundDeployer.getCreator();
    expect(getCreatorCall).toMatchAddress(deployer);

    const getDispatcherCall = await fundDeployer.getDispatcher();
    expect(getDispatcherCall).toMatchAddress(dispatcher);

    const getEngineCall = await fundDeployer.getEngine();
    expect(getEngineCall).toMatchAddress(engine);

    const getOwnerCall = await fundDeployer.getOwner();
    expect(getOwnerCall).toMatchAddress(deployer);

    const getReleaseStatusCall = await fundDeployer.getReleaseStatus();
    expect(getReleaseStatusCall).toBe(ReleaseStatusTypes.PreLaunch);

    const getVaultLibCall = await fundDeployer.getVaultLib();
    expect(getVaultLibCall).toMatchAddress(vaultLib);

    for (const key in registeredVaultCalls.contracts) {
      const isRegisteredVaultCallCall = await fundDeployer.isRegisteredVaultCall(
        registeredVaultCalls.contracts[key],
        registeredVaultCalls.selectors[key],
      );
      expect(isRegisteredVaultCallCall).toBe(true);
    }
  });
});

describe('setComptrollerLib', () => {
  it.todo('emits ControllerLibSet event');

  it('is set during deployment and can only be set once', async () => {
    const {
      deployment: { fundDeployer, comptrollerLib },
    } = await provider.snapshot(snapshot);

    const comptrollerLibCall = await fundDeployer.getComptrollerLib();
    expect(comptrollerLibCall).toMatchAddress(comptrollerLib);

    await expect(
      fundDeployer.setComptrollerLib(randomAddress()),
    ).rejects.toBeRevertedWith('This value can only be set once');
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

    const receipt = await fundDeployer.setReleaseStatus(
      ReleaseStatusTypes.Live,
    );

    // ReleaseStatusSet event is emitted
    assertEvent(receipt, 'ReleaseStatusSet', {
      prevStatus: ReleaseStatusTypes.PreLaunch,
      nextStatus: ReleaseStatusTypes.Live,
    });

    // Release Status should be Live
    const getReleaseStatusCall = await fundDeployer.getReleaseStatus();
    expect(getReleaseStatusCall).toBe(ReleaseStatusTypes.Live);
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
