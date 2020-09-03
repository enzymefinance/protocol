import { BuidlerProvider, randomAddress } from '@crestproject/crestproject';
import { defaultTestDeployment } from '../../';
import { createNewFund } from '../utils/fund';

async function snapshot(provider: BuidlerProvider) {
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
      deployment: { dispatcher, engine, fundDeployer, vaultLib },
      config: { mtc },
    } = await provider.snapshot(snapshot);

    const mtcCall = fundDeployer.getMTC();
    await expect(mtcCall).resolves.toBe(mtc);

    const engineCall = fundDeployer.getEngine();
    await expect(engineCall).resolves.toBe(engine.address);

    const dispatcherCall = fundDeployer.getDispatcher();
    await expect(dispatcherCall).resolves.toBe(dispatcher.address);

    const vaultLibCall = fundDeployer.getVaultLib();
    await expect(vaultLibCall).resolves.toBe(vaultLib.address);
  });
});

describe('setComptrollerLib', () => {
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

    const ownerCall = comptrollerProxy.getOwner();
    await expect(ownerCall).resolves.toBe(fundOwner);

    const vaultProxyCall = comptrollerProxy.getVaultProxy();
    await expect(vaultProxyCall).resolves.toBe(vaultProxy.address);
  });
});

describe('postMigrateOriginHook', () => {
  it.todo('write tests');
});
