import {
  EthereumTestnetProvider,
  extractEvent,
  randomAddress,
} from '@crestproject/crestproject';
import { assertEvent } from '@melonproject/utils';
import { utils, constants, BigNumber } from 'ethers';
import { defaultTestDeployment } from '../../../..';
import { ComptrollerLib, VaultLib } from '../../../../utils/contracts';
import { createNewFund } from '../../../utils';

async function snapshot(provider: EthereumTestnetProvider) {
  const { accounts, deployment, config } = await defaultTestDeployment(
    provider,
  );

  const [fundOwner, ...remainingAccounts] = accounts;
  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: config.deployer,
    fundOwner,
    fundDeployer: deployment.fundDeployer,
    denominationAsset: deployment.tokens.weth,
  });

  // Deploy connected mocks for ComptrollerProxy and VaultProxy
  const mockComptrollerProxy = await ComptrollerLib.mock(config.deployer);
  const mockVaultProxy = await VaultLib.mock(config.deployer);
  await mockVaultProxy.getAccessor.returns(mockComptrollerProxy);
  await mockComptrollerProxy.getVaultProxy.returns(mockVaultProxy);

  return {
    accounts: remainingAccounts,
    deployment,
    config,
    fund: {
      comptrollerProxy,
      fundOwner,
      vaultProxy,
    },
    mockComptrollerProxy,
    mockVaultProxy,
  };
}

describe('constructor', () => {
  it('sets state vars', async () => {
    const {
      config: {
        integrationManager: { trackedAssetsLimit },
      },
      deployment: {
        integrationManager,
        fundDeployer,
        policyManager,
        valueInterpreter,
      },
    } = await provider.snapshot(snapshot);

    const getFundDeployerCall = integrationManager.getFundDeployer();
    await expect(getFundDeployerCall).resolves.toBe(fundDeployer.address);

    const getPolicyManagerCall = integrationManager.getPolicyManager();
    await expect(getPolicyManagerCall).resolves.toBe(policyManager.address);

    const getTrackedAssetsLimitCall = integrationManager.getTrackedAssetsLimit();
    await expect(getTrackedAssetsLimitCall).resolves.toEqBigNumber(
      trackedAssetsLimit,
    );

    const getValueInterpreterCall = integrationManager.getValueInterpreter();
    await expect(getValueInterpreterCall).resolves.toBe(
      valueInterpreter.address,
    );
  });
});

describe('activateForFund', () => {
  it('does not allow an already active fund', async () => {
    const {
      deployment: { integrationManager },
      mockComptrollerProxy,
    } = await provider.snapshot(snapshot);

    // Should pass the first time
    const goodActivateTx = mockComptrollerProxy.forward(
      integrationManager.activateForFund,
    );
    await expect(goodActivateTx).resolves.toBeReceipt();

    // Should fail a second time
    const badActivateTx = mockComptrollerProxy.forward(
      integrationManager.activateForFund,
    );
    await expect(badActivateTx).rejects.toBeRevertedWith('Already set');
  });

  it('does not allow a missing vaultProxy', async () => {
    const {
      deployment: { integrationManager },
      mockComptrollerProxy,
    } = await provider.snapshot(snapshot);

    await mockComptrollerProxy.getVaultProxy.returns(constants.AddressZero);

    const badActivateTx = mockComptrollerProxy.forward(
      integrationManager.activateForFund,
    );
    await expect(badActivateTx).rejects.toBeRevertedWith('Missing vaultProxy');
  });

  it('does not allow a vaultProxy for which the sender is not the accessor', async () => {
    const {
      deployment: { integrationManager },
      mockComptrollerProxy,
      mockVaultProxy,
    } = await provider.snapshot(snapshot);

    await mockVaultProxy.getAccessor.returns(randomAddress());

    const badActivateTx = mockComptrollerProxy.forward(
      integrationManager.activateForFund,
    );
    await expect(badActivateTx).rejects.toBeRevertedWith(
      'Not the VaultProxy accessor',
    );
  });

  it('correctly handles a valid call', async () => {
    const {
      deployment: { integrationManager },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    // Stores the ComptrollerProxy-VaultProxy pairing
    const getVaultProxyForFundCall = integrationManager.getVaultProxyForFund(
      comptrollerProxy,
    );
    await expect(getVaultProxyForFundCall).resolves.toBe(vaultProxy.address);

    // Vault owner should be an authorized user
    const isAuthUserForFundCall = integrationManager.isAuthUserForFund(
      comptrollerProxy,
      fundOwner,
    );
    await expect(isAuthUserForFundCall).resolves.toBe(true);
  });
});

describe('deactivateForFund', () => {
  it('correctly handles a valid call', async () => {
    const {
      deployment: { integrationManager },
      mockComptrollerProxy,
    } = await provider.snapshot(snapshot);

    // Activate the fund
    const activateTx = mockComptrollerProxy.forward(
      integrationManager.activateForFund,
    );
    await expect(activateTx).resolves.toBeReceipt();

    // Deactivate the fund
    const deactivateTx = mockComptrollerProxy.forward(
      integrationManager.deactivateForFund,
    );
    await expect(deactivateTx).resolves.toBeReceipt();

    // The ComptrollerProxy-VaultProxy pairing should be deleted
    const getVaultProxyForFundCall = integrationManager.getVaultProxyForFund(
      mockComptrollerProxy,
    );
    await expect(getVaultProxyForFundCall).resolves.toBe(constants.AddressZero);
  });
});

describe('auth users', () => {
  describe('addAuthUserForFund', () => {
    it('does not allow an already-added auth user', async () => {
      const {
        deployment: { integrationManager },
        fund: { comptrollerProxy, fundOwner },
      } = await provider.snapshot(snapshot);

      // Set the newManager as an auth user
      const newManager = randomAddress();
      const goodAddAuthUserForFundTx = integrationManager
        .connect(fundOwner)
        .addAuthUserForFund(comptrollerProxy, newManager);
      await expect(goodAddAuthUserForFundTx).resolves.toBeReceipt();

      // Adding the already added manager should fail
      const badAddAuthUserForFundTx = integrationManager
        .connect(fundOwner)
        .addAuthUserForFund(comptrollerProxy, newManager);
      await expect(badAddAuthUserForFundTx).rejects.toBeRevertedWith(
        'Account is already an authorized user',
      );
    });

    it('correctly handles a valid call', async () => {
      const {
        deployment: { integrationManager },
        fund: { comptrollerProxy, fundOwner },
      } = await provider.snapshot(snapshot);

      // isAuthUserForFund should be false for an unset manager
      const newManager = randomAddress();
      const preIsAuthUserForFundCall = integrationManager.isAuthUserForFund(
        comptrollerProxy,
        newManager,
      );
      await expect(preIsAuthUserForFundCall).resolves.toBe(false);

      // Set the newManager as an auth user
      const addAuthUserForFundTx = integrationManager
        .connect(fundOwner)
        .addAuthUserForFund(comptrollerProxy, newManager);
      await expect(addAuthUserForFundTx).resolves.toBeReceipt();

      // isAuthUserForFund should now be true
      const postIsAuthUserForFundCall = integrationManager.isAuthUserForFund(
        comptrollerProxy,
        newManager,
      );
      await expect(postIsAuthUserForFundCall).resolves.toBe(true);

      // Assert event
      await assertEvent(addAuthUserForFundTx, 'AuthUserAddedForFund', {
        comptrollerProxy: comptrollerProxy.address,
        account: newManager,
      });
    });
  });

  describe('removeAuthUserForFund', () => {
    it('does not allow a non-existent auth user', async () => {
      const {
        deployment: { integrationManager },
        fund: { comptrollerProxy, fundOwner },
      } = await provider.snapshot(snapshot);

      const badRemoveAuthUserForFundTx = integrationManager
        .connect(fundOwner)
        .removeAuthUserForFund(comptrollerProxy, randomAddress());
      await expect(badRemoveAuthUserForFundTx).rejects.toBeRevertedWith(
        'Account is not an authorized user',
      );
    });

    it('correctly handles a valid call', async () => {
      const {
        deployment: { integrationManager },
        fund: { comptrollerProxy, fundOwner },
      } = await provider.snapshot(snapshot);

      // Add a new auth user
      const newManager = randomAddress();
      const addAuthUserForFundTx = integrationManager
        .connect(fundOwner)
        .addAuthUserForFund(comptrollerProxy, newManager);
      await expect(addAuthUserForFundTx).resolves.toBeReceipt();

      // isAuthUserForFund should be true
      const preIsAuthUserForFundCall = integrationManager.isAuthUserForFund(
        comptrollerProxy,
        newManager,
      );
      await expect(preIsAuthUserForFundCall).resolves.toBe(true);

      // Remove the auth user
      const removeAuthUserForFundTx = integrationManager
        .connect(fundOwner)
        .removeAuthUserForFund(comptrollerProxy, newManager);
      await expect(removeAuthUserForFundTx).resolves.toBeReceipt();

      // isAuthUserForFund should now be false
      const postIsAuthUserForFundCall = integrationManager.isAuthUserForFund(
        comptrollerProxy,
        newManager,
      );
      await expect(postIsAuthUserForFundCall).resolves.toBe(false);

      // Assert event
      await assertEvent(removeAuthUserForFundTx, 'AuthUserRemovedForFund', {
        comptrollerProxy: comptrollerProxy.address,
        account: newManager,
      });
    });
  });

  // Common validation for the above functions
  describe('__validateSetAuthUser', () => {
    it('does not allow a non-activated fund', async () => {
      const {
        deployment: { integrationManager },
      } = await provider.snapshot(snapshot);

      const badAddAuthUserForFundTx = integrationManager.addAuthUserForFund(
        randomAddress(),
        randomAddress(),
      );
      await expect(badAddAuthUserForFundTx).rejects.toBeRevertedWith(
        'Fund has not been activated',
      );
    });

    it('does not allow a random user', async () => {
      const {
        accounts: { 0: randomUser },
        deployment: { integrationManager },
        fund: { comptrollerProxy },
      } = await provider.snapshot(snapshot);

      const badAddAuthUserForFundTx = integrationManager
        .connect(randomUser)
        .addAuthUserForFund(comptrollerProxy, randomAddress());
      await expect(badAddAuthUserForFundTx).rejects.toBeRevertedWith(
        'Only the fund owner can call this function',
      );
    });

    it('does not allow inputting the fund owner as auth user', async () => {
      const {
        deployment: { integrationManager },
        fund: { comptrollerProxy, fundOwner },
      } = await provider.snapshot(snapshot);

      const badAddAuthUserForFundTx = integrationManager
        .connect(fundOwner)
        .addAuthUserForFund(comptrollerProxy, fundOwner);
      await expect(badAddAuthUserForFundTx).rejects.toBeRevertedWith(
        'Cannot set for the fund owner',
      );
    });
  });
});

describe('adapter registry', () => {
  describe('deregisterAdapters', () => {
    it('can only be called by fundDeployerOwner', async () => {
      const {
        accounts: { 0: randomUser },
        deployment: { integrationManager },
      } = await provider.snapshot(snapshot);

      const deregisterAdaptersTx = integrationManager
        .connect(randomUser)
        .deregisterAdapters([]);
      await expect(deregisterAdaptersTx).rejects.toBeRevertedWith(
        'Only the FundDeployer owner can call this function',
      );
    });

    it('does not allow an empty _adapters value', async () => {
      const {
        deployment: { integrationManager },
      } = await provider.snapshot(snapshot);

      const deregisterAdaptersTx = integrationManager.deregisterAdapters([]);
      await expect(deregisterAdaptersTx).rejects.toBeRevertedWith(
        '_adapters cannot be empty',
      );
    });

    it('correctly handles valid call', async () => {
      const {
        deployment: { integrationManager, kyberAdapter, chaiAdapter },
      } = await provider.snapshot(snapshot);

      const preAdapters = await integrationManager.getRegisteredAdapters();
      expect(preAdapters).toEqual(
        expect.arrayContaining([kyberAdapter.address, chaiAdapter.address]),
      );

      const deregisterAdaptersTx = integrationManager.deregisterAdapters([
        kyberAdapter,
        chaiAdapter,
      ]);
      const events = extractEvent(
        await deregisterAdaptersTx,
        'AdapterDeregistered',
      );
      expect(events.length).toBe(2);
      expect(events[0].args).toMatchObject({
        0: kyberAdapter.address,
        1: expect.objectContaining({
          hash: utils.id('KYBER_NETWORK'),
        }),
      });
      expect(events[1].args).toMatchObject({
        0: chaiAdapter.address,
        1: expect.objectContaining({
          hash: utils.id('CHAI'),
        }),
      });

      const postAdapters = await integrationManager.getRegisteredAdapters();
      expect(postAdapters.includes(kyberAdapter.address)).toBe(false);
      expect(postAdapters.includes(chaiAdapter.address)).toBe(false);
      expect(postAdapters.length).toBe(preAdapters.length - 2);
    });

    it('does not allow an unregistered adapter', async () => {
      const {
        deployment: { integrationManager, kyberAdapter },
      } = await provider.snapshot(snapshot);

      let deregisterAdaptersTx = integrationManager.deregisterAdapters([
        kyberAdapter,
      ]);
      await expect(deregisterAdaptersTx).resolves.toBeReceipt();
      deregisterAdaptersTx = integrationManager.deregisterAdapters([
        kyberAdapter,
      ]);
      await expect(deregisterAdaptersTx).rejects.toBeRevertedWith(
        'adapter is not registered',
      );
    });
  });

  describe('registerAdapters', () => {
    it('can only be called by fundDeployerOwner', async () => {
      const {
        accounts: { 0: randomUser },
        deployment: { integrationManager },
      } = await provider.snapshot(snapshot);

      const registerAdaptersTx = integrationManager
        .connect(randomUser)
        .registerAdapters([]);
      await expect(registerAdaptersTx).rejects.toBeRevertedWith(
        'Only the FundDeployer owner can call this function',
      );
    });

    it('does not allow an empty _adapters value', async () => {
      const {
        deployment: { integrationManager },
      } = await provider.snapshot(snapshot);

      let registerAdaptersTx = integrationManager.registerAdapters([]);
      await expect(registerAdaptersTx).rejects.toBeRevertedWith(
        '_adapters cannot be empty',
      );
      registerAdaptersTx = integrationManager.registerAdapters([
        constants.AddressZero,
      ]);
      await expect(registerAdaptersTx).rejects.toBeRevertedWith(
        'adapter cannot be empty',
      );
    });

    it('does not allow a registered adapter', async () => {
      const {
        deployment: { integrationManager, kyberAdapter, chaiAdapter },
      } = await provider.snapshot(snapshot);

      const registerAdaptersTx = integrationManager.registerAdapters([
        kyberAdapter,
        chaiAdapter,
      ]);
      await expect(registerAdaptersTx).rejects.toBeRevertedWith(
        'adapter already registered',
      );
    });

    it('correctly handles valid call', async () => {
      const {
        deployment: { integrationManager, kyberAdapter, chaiAdapter },
      } = await provider.snapshot(snapshot);

      const deregisterAdaptersTx = integrationManager.deregisterAdapters([
        kyberAdapter,
        chaiAdapter,
      ]);
      await expect(deregisterAdaptersTx).resolves.toBeReceipt();

      const registerAdaptersTx = integrationManager.registerAdapters([
        kyberAdapter,
        chaiAdapter,
      ]);
      const events = extractEvent(
        await registerAdaptersTx,
        'AdapterRegistered',
      );
      expect(events.length).toBe(2);
      expect(events[0].args).toMatchObject({
        0: kyberAdapter.address,
        1: expect.objectContaining({
          hash: utils.id('KYBER_NETWORK'),
        }),
      });
      expect(events[1].args).toMatchObject({
        0: chaiAdapter.address,
        1: expect.objectContaining({
          hash: utils.id('CHAI'),
        }),
      });

      const getRegisteredAdaptersCall = integrationManager.getRegisteredAdapters();
      await expect(getRegisteredAdaptersCall).resolves.toEqual(
        expect.arrayContaining([kyberAdapter.address, chaiAdapter.address]),
      );
    });
  });
});

describe('setTrackedAssetsLimit', () => {
  it('can only be called by fundDeployerOwner', async () => {
    const {
      accounts: { 0: randomUser },
      deployment: { integrationManager },
    } = await provider.snapshot(snapshot);

    const setTrackedAssetsLimitTx = integrationManager
      .connect(randomUser)
      .setTrackedAssetsLimit(1);
    await expect(setTrackedAssetsLimitTx).rejects.toBeRevertedWith(
      'Only the FundDeployer owner can call this function',
    );
  });

  it('correctly handles a valid call', async () => {
    const {
      deployment: { integrationManager },
    } = await provider.snapshot(snapshot);

    const nextTrackedAssetsLimit = 1;
    const setTrackedAssetsLimitTx = integrationManager.setTrackedAssetsLimit(
      nextTrackedAssetsLimit,
    );
    await expect(setTrackedAssetsLimitTx).resolves.toBeReceipt();

    // Assert state has updated
    const getTrackedAssetsLimitCall = integrationManager.getTrackedAssetsLimit();
    await expect(getTrackedAssetsLimitCall).resolves.toEqBigNumber(
      nextTrackedAssetsLimit,
    );

    // Assert event
    await assertEvent(setTrackedAssetsLimitTx, 'TrackedAssetsLimitSet', {
      nextTrackedAssetsLimit: BigNumber.from(nextTrackedAssetsLimit),
    });
  });
});
