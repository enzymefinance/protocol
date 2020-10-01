import {
  EthereumTestnetProvider,
  randomAddress,
  resolveAddress,
} from '@crestproject/crestproject';
import { assertEvent } from '@melonproject/utils';
import { defaultTestDeployment } from '../../';
import { createNewFund, releaseStatusTypes } from '../utils';

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
      config: { deployer },
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

    // TODO: add registered vault calls
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

describe('createNewFund', () => {
  it('does not allow a denomination asset that is not a valid primitive', async () => {
    const {
      deployment: { fundDeployer },
    } = await provider.snapshot(snapshot);

    const newFundTx = fundDeployer.createNewFund(
      randomAddress(),
      'My Fund',
      randomAddress(),
      '0x',
      '0x',
    );

    await expect(newFundTx).rejects.toBeRevertedWith(
      'Denomination asset must be a supported primitive',
    );
  });

  it('can create a fund without extensions', async () => {
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

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      signer,
      fundDeployer,
      fundOwner,
      fundName,
      denominationAsset,
    });

    const denominationAssetCall = comptrollerProxy.getDenominationAsset();
    await expect(denominationAssetCall).resolves.toBe(
      denominationAsset.address,
    );

    const initializedCall = comptrollerProxy.getInitialized();
    await expect(initializedCall).resolves.toBe(true);

    const vaultProxyCall = comptrollerProxy.getVaultProxy();
    await expect(vaultProxyCall).resolves.toBe(vaultProxy.address);
  });
});

describe('postMigrateOriginHook', () => {
  it.todo('write tests');
});

describe('deregisterVaultCalls', () => {
  it.todo('write tests');
});

describe('registerVaultCalls', () => {
  it.todo('write tests');
});
