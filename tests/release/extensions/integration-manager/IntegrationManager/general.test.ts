import { utils, constants, BigNumber } from 'ethers';
import { EthereumTestnetProvider, extractEvent, randomAddress } from '@crestproject/crestproject';
import { ComptrollerLib, VaultLib } from '@melonproject/protocol';
import { defaultTestDeployment, assertEvent, createNewFund } from '@melonproject/testutils';

async function snapshot(provider: EthereumTestnetProvider) {
  const {
    accounts: [fundOwner, ...remainingAccounts],
    deployment,
    config,
  } = await defaultTestDeployment(provider);

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
        integratees: { synthetix },
      },
      deployment: {
        aggregatedDerivativePriceFeed,
        chainlinkPriceFeed,
        integrationManager,
        fundDeployer,
        policyManager,
        synthetixPriceFeed,
      },
    } = await provider.snapshot(snapshot);

    const getDerivativePriceFeedCall = await integrationManager.getDerivativePriceFeed();
    expect(getDerivativePriceFeedCall).toMatchAddress(aggregatedDerivativePriceFeed);

    const getFundDeployerCall = await integrationManager.getFundDeployer();
    expect(getFundDeployerCall).toMatchAddress(fundDeployer);

    const getPolicyManagerCall = await integrationManager.getPolicyManager();
    expect(getPolicyManagerCall).toMatchAddress(policyManager);

    const getPrimitivePriceFeedCall = await integrationManager.getPrimitivePriceFeed();
    expect(getPrimitivePriceFeedCall).toMatchAddress(chainlinkPriceFeed);

    const getTrackedAssetsLimitCall = await integrationManager.getTrackedAssetsLimit();
    expect(getTrackedAssetsLimitCall).toEqBigNumber(trackedAssetsLimit);

    // AssetFinalityResolver
    const getSynthetixAddressResolverCall = await integrationManager.getSynthetixAddressResolver();
    expect(getSynthetixAddressResolverCall).toMatchAddress(synthetix.addressResolver);

    const getSynthetixPriceFeedCall = await integrationManager.getSynthetixPriceFeed();
    expect(getSynthetixPriceFeedCall).toMatchAddress(synthetixPriceFeed);
  });
});

describe('activateForFund', () => {
  it('does not allow an already active fund', async () => {
    const {
      deployment: { integrationManager },
      mockComptrollerProxy,
    } = await provider.snapshot(snapshot);

    // Should pass the first time
    await expect(mockComptrollerProxy.forward(integrationManager.activateForFund, false)).resolves.toBeReceipt();

    // Should fail a second time
    await expect(mockComptrollerProxy.forward(integrationManager.activateForFund, false)).rejects.toBeRevertedWith(
      'Already set',
    );
  });

  it('does not allow a missing vaultProxy', async () => {
    const {
      deployment: { integrationManager },
      mockComptrollerProxy,
    } = await provider.snapshot(snapshot);

    await mockComptrollerProxy.getVaultProxy.returns(constants.AddressZero);

    await expect(mockComptrollerProxy.forward(integrationManager.activateForFund, false)).rejects.toBeRevertedWith(
      'Missing vaultProxy',
    );
  });

  it('does not allow a vaultProxy for which the sender is not the accessor', async () => {
    const {
      deployment: { integrationManager },
      mockComptrollerProxy,
      mockVaultProxy,
    } = await provider.snapshot(snapshot);

    await mockVaultProxy.getAccessor.returns(randomAddress());

    await expect(mockComptrollerProxy.forward(integrationManager.activateForFund, false)).rejects.toBeRevertedWith(
      'Not the VaultProxy accessor',
    );
  });

  it('correctly handles a valid call', async () => {
    const {
      deployment: { integrationManager },
      fund: { comptrollerProxy, fundOwner, vaultProxy },
    } = await provider.snapshot(snapshot);

    // Stores the ComptrollerProxy-VaultProxy pairing
    const getVaultProxyForFundCall = await integrationManager.getVaultProxyForFund(comptrollerProxy);

    expect(getVaultProxyForFundCall).toMatchAddress(vaultProxy);

    // Vault owner should be an authorized user
    const isAuthUserForFundCall = await integrationManager.isAuthUserForFund(comptrollerProxy, fundOwner);

    expect(isAuthUserForFundCall).toBe(true);
  });
});

describe('deactivateForFund', () => {
  it('correctly handles a valid call', async () => {
    const {
      deployment: { integrationManager },
      mockComptrollerProxy,
    } = await provider.snapshot(snapshot);

    // Activate the fund
    await mockComptrollerProxy.forward(integrationManager.activateForFund, false);

    // Deactivate the fund
    await mockComptrollerProxy.forward(integrationManager.deactivateForFund);

    // The ComptrollerProxy-VaultProxy pairing should be deleted
    const getVaultProxyForFundCall = await integrationManager.getVaultProxyForFund(mockComptrollerProxy);

    expect(getVaultProxyForFundCall).toMatchAddress(constants.AddressZero);
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

      await expect(
        integrationManager.connect(fundOwner).addAuthUserForFund(comptrollerProxy, newManager),
      ).resolves.toBeReceipt();

      // Adding the already added manager should fail
      await expect(
        integrationManager.connect(fundOwner).addAuthUserForFund(comptrollerProxy, newManager),
      ).rejects.toBeRevertedWith('Account is already an authorized user');
    });

    it('correctly handles a valid call', async () => {
      const {
        deployment: { integrationManager },
        fund: { comptrollerProxy, fundOwner },
      } = await provider.snapshot(snapshot);

      // isAuthUserForFund should be false for an unset manager
      const newManager = randomAddress();
      const preIsAuthUserForFundCall = await integrationManager.isAuthUserForFund(comptrollerProxy, newManager);

      expect(preIsAuthUserForFundCall).toBe(false);

      // Set the newManager as an auth user
      const receipt = await integrationManager.connect(fundOwner).addAuthUserForFund(comptrollerProxy, newManager);

      // Assert event
      assertEvent(receipt, 'AuthUserAddedForFund', {
        comptrollerProxy,
        account: newManager,
      });

      // isAuthUserForFund should now be true
      const postIsAuthUserForFundCall = await integrationManager.isAuthUserForFund(comptrollerProxy, newManager);

      expect(postIsAuthUserForFundCall).toBe(true);
    });
  });

  describe('removeAuthUserForFund', () => {
    it('does not allow a non-existent auth user', async () => {
      const {
        deployment: { integrationManager },
        fund: { comptrollerProxy, fundOwner },
      } = await provider.snapshot(snapshot);

      await expect(
        integrationManager.connect(fundOwner).removeAuthUserForFund(comptrollerProxy, randomAddress()),
      ).rejects.toBeRevertedWith('Account is not an authorized user');
    });

    it('correctly handles a valid call', async () => {
      const {
        deployment: { integrationManager },
        fund: { comptrollerProxy, fundOwner },
      } = await provider.snapshot(snapshot);

      // Add a new auth user
      const newManager = randomAddress();
      await integrationManager.connect(fundOwner).addAuthUserForFund(comptrollerProxy, newManager);

      // isAuthUserForFund should be true
      const preIsAuthUserForFundCall = await integrationManager.isAuthUserForFund(comptrollerProxy, newManager);

      expect(preIsAuthUserForFundCall).toBe(true);

      // Remove the auth user
      const receipt = await integrationManager.connect(fundOwner).removeAuthUserForFund(comptrollerProxy, newManager);

      // Assert event
      assertEvent(receipt, 'AuthUserRemovedForFund', {
        comptrollerProxy,
        account: newManager,
      });

      // isAuthUserForFund should now be false
      const postIsAuthUserForFundCall = await integrationManager.isAuthUserForFund(comptrollerProxy, newManager);

      expect(postIsAuthUserForFundCall).toBe(false);
    });
  });

  // Common validation for the above functions
  describe('__validateSetAuthUser', () => {
    it('does not allow a non-activated fund', async () => {
      const {
        deployment: { integrationManager },
      } = await provider.snapshot(snapshot);

      await expect(integrationManager.addAuthUserForFund(randomAddress(), randomAddress())).rejects.toBeRevertedWith(
        'Fund has not been activated',
      );
    });

    it('does not allow a random user', async () => {
      const {
        accounts: [randomUser],
        deployment: { integrationManager },
        fund: { comptrollerProxy },
      } = await provider.snapshot(snapshot);

      await expect(
        integrationManager.connect(randomUser).addAuthUserForFund(comptrollerProxy, randomAddress()),
      ).rejects.toBeRevertedWith('Only the fund owner can call this function');
    });

    it('does not allow inputting the fund owner as auth user', async () => {
      const {
        deployment: { integrationManager },
        fund: { comptrollerProxy, fundOwner },
      } = await provider.snapshot(snapshot);

      await expect(
        integrationManager.connect(fundOwner).addAuthUserForFund(comptrollerProxy, fundOwner),
      ).rejects.toBeRevertedWith('Cannot set for the fund owner');
    });
  });
});

describe('adapter registry', () => {
  describe('deregisterAdapters', () => {
    it('can only be called by fundDeployerOwner', async () => {
      const {
        accounts: [randomUser],
        deployment: { integrationManager },
      } = await provider.snapshot(snapshot);

      await expect(integrationManager.connect(randomUser).deregisterAdapters([])).rejects.toBeRevertedWith(
        'Only the FundDeployer owner can call this function',
      );
    });

    it('does not allow an empty _adapters value', async () => {
      const {
        deployment: { integrationManager },
      } = await provider.snapshot(snapshot);

      await expect(integrationManager.deregisterAdapters([])).rejects.toBeRevertedWith('_adapters cannot be empty');
    });

    it('correctly handles valid call', async () => {
      const {
        deployment: { integrationManager, kyberAdapter, chaiAdapter },
      } = await provider.snapshot(snapshot);

      const preAdapters = await integrationManager.getRegisteredAdapters();
      expect(preAdapters).toEqual(expect.arrayContaining([kyberAdapter.address, chaiAdapter.address]));

      const receipt = await integrationManager.deregisterAdapters([kyberAdapter, chaiAdapter]);
      const events = extractEvent(receipt, 'AdapterDeregistered');

      expect(events.length).toBe(2);
      expect(events[0]).toMatchEventArgs({
        adapter: kyberAdapter,
        identifier: expect.objectContaining({
          hash: utils.id('KYBER_NETWORK'),
        }),
      });

      expect(events[1]).toMatchEventArgs({
        adapter: chaiAdapter,
        identifier: expect.objectContaining({
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

      await expect(integrationManager.deregisterAdapters([kyberAdapter])).resolves.toBeReceipt();
      await expect(integrationManager.deregisterAdapters([kyberAdapter])).rejects.toBeRevertedWith(
        'Adapter is not registered',
      );
    });
  });

  describe('registerAdapters', () => {
    it('can only be called by fundDeployerOwner', async () => {
      const {
        accounts: [randomUser],
        deployment: { integrationManager },
      } = await provider.snapshot(snapshot);

      await expect(integrationManager.connect(randomUser).registerAdapters([])).rejects.toBeRevertedWith(
        'Only the FundDeployer owner can call this function',
      );
    });

    it('does not allow an empty _adapters value', async () => {
      const {
        deployment: { integrationManager },
      } = await provider.snapshot(snapshot);

      await expect(integrationManager.registerAdapters([])).rejects.toBeRevertedWith('_adapters cannot be empty');
      await expect(integrationManager.registerAdapters([constants.AddressZero])).rejects.toBeRevertedWith(
        'Adapter cannot be empty',
      );
    });

    it('does not allow a registered adapter', async () => {
      const {
        deployment: { integrationManager, kyberAdapter, chaiAdapter },
      } = await provider.snapshot(snapshot);

      await expect(integrationManager.registerAdapters([kyberAdapter, chaiAdapter])).rejects.toBeRevertedWith(
        'Adapter already registered',
      );
    });

    it('correctly handles valid call', async () => {
      const {
        deployment: { integrationManager, kyberAdapter, chaiAdapter },
      } = await provider.snapshot(snapshot);

      await integrationManager.deregisterAdapters([kyberAdapter, chaiAdapter]);
      const receipt = await integrationManager.registerAdapters([kyberAdapter, chaiAdapter]);

      const events = extractEvent(receipt, 'AdapterRegistered');
      expect(events.length).toBe(2);
      expect(events[0]).toMatchEventArgs({
        adapter: kyberAdapter,
        identifier: expect.objectContaining({
          hash: utils.id('KYBER_NETWORK'),
        }),
      });

      expect(events[1]).toMatchEventArgs({
        adapter: chaiAdapter,
        identifier: expect.objectContaining({
          hash: utils.id('CHAI'),
        }),
      });

      const getRegisteredAdaptersCall = await integrationManager.getRegisteredAdapters();
      expect(getRegisteredAdaptersCall).toEqual(expect.arrayContaining([kyberAdapter.address, chaiAdapter.address]));
    });
  });
});

describe('setTrackedAssetsLimit', () => {
  it('can only be called by fundDeployerOwner', async () => {
    const {
      accounts: [randomUser],
      deployment: { integrationManager },
    } = await provider.snapshot(snapshot);

    await expect(integrationManager.connect(randomUser).setTrackedAssetsLimit(1)).rejects.toBeRevertedWith(
      'Only the FundDeployer owner can call this function',
    );
  });

  it('correctly handles a valid call', async () => {
    const {
      deployment: { integrationManager },
    } = await provider.snapshot(snapshot);

    const nextTrackedAssetsLimit = 1;
    const receipt = await integrationManager.setTrackedAssetsLimit(nextTrackedAssetsLimit);

    // Assert event
    assertEvent(receipt, 'TrackedAssetsLimitSet', {
      nextTrackedAssetsLimit: BigNumber.from(nextTrackedAssetsLimit),
    });

    // Assert state has updated
    const getTrackedAssetsLimitCall = await integrationManager.getTrackedAssetsLimit();
    expect(getTrackedAssetsLimitCall).toEqBigNumber(nextTrackedAssetsLimit);
  });
});
