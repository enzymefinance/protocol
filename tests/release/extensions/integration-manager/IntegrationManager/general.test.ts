import { extractEvent, randomAddress } from '@enzymefinance/ethers';
import {
  addZeroBalanceTrackedAssetsArgs,
  ComptrollerLib,
  IntegrationManagerActionId,
  removeZeroBalanceTrackedAssetsArgs,
  StandardToken,
  VaultLib,
  WETH,
} from '@enzymefinance/protocol';
import { addNewAssetsToFund, assertEvent, createNewFund, deployProtocolFixture } from '@enzymefinance/testutils';
import { constants, utils } from 'ethers';

async function snapshot() {
  const {
    accounts: [fundOwner, ...remainingAccounts],
    deployment,
    config,
    deployer,
  } = await deployProtocolFixture();

  const denominationAsset = new WETH(config.weth, whales.weth);
  const { comptrollerProxy, vaultProxy } = await createNewFund({
    signer: deployer,
    fundOwner,
    fundDeployer: deployment.fundDeployer,
    denominationAsset,
  });

  // Deploy connected mocks for ComptrollerProxy and VaultProxy
  const mockComptrollerProxy = await ComptrollerLib.mock(deployer);
  const mockVaultProxy = await VaultLib.mock(deployer);
  await mockVaultProxy.getAccessor.returns(mockComptrollerProxy);
  await mockComptrollerProxy.getVaultProxy.returns(mockVaultProxy);

  return {
    accounts: remainingAccounts,
    deployment,
    config,
    fund: {
      comptrollerProxy,
      denominationAsset,
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
      deployment: {
        aggregatedDerivativePriceFeed,
        chainlinkPriceFeed,
        integrationManager,
        fundDeployer,
        policyManager,
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

describe('callOnExtension actions', () => {
  describe('__addZeroBalanceTrackedAssets', () => {
    it('only allows authorized users', async () => {
      const {
        accounts: [newAuthUser],
        deployment: { integrationManager },
        config: {
          primitives: { mln: assetToAdd1, dai: assetToAdd2 },
        },
        fund: { comptrollerProxy, fundOwner },
      } = await provider.snapshot(snapshot);

      // Call should be allowed by the fund owner
      await expect(
        comptrollerProxy
          .connect(fundOwner)
          .callOnExtension(
            integrationManager,
            IntegrationManagerActionId.AddZeroBalanceTrackedAssets,
            addZeroBalanceTrackedAssetsArgs({ assets: [assetToAdd1] }),
          ),
      ).resolves.toBeReceipt();

      // Call not allowed by the yet-to-be authorized user
      await expect(
        comptrollerProxy
          .connect(newAuthUser)
          .callOnExtension(
            integrationManager,
            IntegrationManagerActionId.AddZeroBalanceTrackedAssets,
            addZeroBalanceTrackedAssetsArgs({ assets: [assetToAdd2] }),
          ),
      ).rejects.toBeRevertedWith('Not an authorized user');

      // Set the new auth user
      await integrationManager.connect(fundOwner).addAuthUserForFund(comptrollerProxy, newAuthUser);

      // Call should be allowed for the authorized user
      await expect(
        comptrollerProxy
          .connect(newAuthUser)
          .callOnExtension(
            integrationManager,
            IntegrationManagerActionId.AddZeroBalanceTrackedAssets,
            addZeroBalanceTrackedAssetsArgs({ assets: [assetToAdd2] }),
          ),
      ).resolves.toBeReceipt();
    });

    it('does not allow an unsupported asset', async () => {
      const {
        deployment: { integrationManager },
        fund: { comptrollerProxy, fundOwner },
      } = await provider.snapshot(snapshot);

      await expect(
        comptrollerProxy
          .connect(fundOwner)
          .callOnExtension(
            integrationManager,
            IntegrationManagerActionId.AddZeroBalanceTrackedAssets,
            addZeroBalanceTrackedAssetsArgs({ assets: [randomAddress()] }),
          ),
      ).rejects.toBeRevertedWith('Unsupported asset');
    });

    it('does not allow an asset with a non-zero balance', async () => {
      const {
        deployment: { integrationManager },
        config: {
          primitives: { mln },
        },
        fund: { comptrollerProxy, fundOwner, vaultProxy },
      } = await provider.snapshot(snapshot);

      // Give the asset to add a non-zero vault balance
      const assetToAdd = new StandardToken(mln, whales.mln);
      await assetToAdd.transfer(vaultProxy, 1);

      await expect(
        comptrollerProxy
          .connect(fundOwner)
          .callOnExtension(
            integrationManager,
            IntegrationManagerActionId.AddZeroBalanceTrackedAssets,
            addZeroBalanceTrackedAssetsArgs({ assets: [assetToAdd] }),
          ),
      ).rejects.toBeRevertedWith('Balance is not zero');
    });

    it('successfully adds each asset to tracked assets', async () => {
      const {
        deployment: { integrationManager },
        config: {
          primitives: { mln: assetToAdd1, dai: assetToAdd2 },
        },
        fund: { comptrollerProxy, fundOwner, vaultProxy },
      } = await provider.snapshot(snapshot);

      // Neither asset to add should be tracked
      expect(await vaultProxy.isTrackedAsset(assetToAdd1)).toBe(false);
      expect(await vaultProxy.isTrackedAsset(assetToAdd2)).toBe(false);

      // Add the assets
      await comptrollerProxy
        .connect(fundOwner)
        .callOnExtension(
          integrationManager,
          IntegrationManagerActionId.AddZeroBalanceTrackedAssets,
          addZeroBalanceTrackedAssetsArgs({ assets: [assetToAdd1, assetToAdd2] }),
        );

      // Both assets should now be tracked
      expect(await vaultProxy.isTrackedAsset(assetToAdd1)).toBe(true);
      expect(await vaultProxy.isTrackedAsset(assetToAdd2)).toBe(true);
    });
  });

  describe('__removeZeroBalanceTrackedAssets', () => {
    it('only allows authorized users', async () => {
      const {
        accounts: [newAuthUser],
        deployment: { integrationManager },
        config: {
          primitives: { mln: assetToRemove1, dai: assetToRemove2 },
        },
        fund: { comptrollerProxy, fundOwner },
      } = await provider.snapshot(snapshot);

      // Add zero-balance assets to the fund
      await comptrollerProxy
        .connect(fundOwner)
        .callOnExtension(
          integrationManager,
          IntegrationManagerActionId.AddZeroBalanceTrackedAssets,
          addZeroBalanceTrackedAssetsArgs({ assets: [assetToRemove1, assetToRemove2] }),
        );

      // Call should be allowed by the fund owner
      await expect(
        comptrollerProxy
          .connect(fundOwner)
          .callOnExtension(
            integrationManager,
            IntegrationManagerActionId.RemoveZeroBalanceTrackedAssets,
            removeZeroBalanceTrackedAssetsArgs({ assets: [assetToRemove1] }),
          ),
      ).resolves.toBeReceipt();

      // Call not allowed by the yet-to-be authorized user
      await expect(
        comptrollerProxy
          .connect(newAuthUser)
          .callOnExtension(
            integrationManager,
            IntegrationManagerActionId.RemoveZeroBalanceTrackedAssets,
            removeZeroBalanceTrackedAssetsArgs({ assets: [assetToRemove2] }),
          ),
      ).rejects.toBeRevertedWith('Not an authorized user');

      // Set the new auth user
      await integrationManager.connect(fundOwner).addAuthUserForFund(comptrollerProxy, newAuthUser);

      // Call should be allowed for the authorized user
      await expect(
        comptrollerProxy
          .connect(newAuthUser)
          .callOnExtension(
            integrationManager,
            IntegrationManagerActionId.RemoveZeroBalanceTrackedAssets,
            removeZeroBalanceTrackedAssetsArgs({ assets: [assetToRemove2] }),
          ),
      ).resolves.toBeReceipt();
    });

    it('does not allow removing the denomination asset', async () => {
      const {
        deployment: { integrationManager },
        fund: { comptrollerProxy, denominationAsset, fundOwner },
      } = await provider.snapshot(snapshot);

      await expect(
        comptrollerProxy
          .connect(fundOwner)
          .callOnExtension(
            integrationManager,
            IntegrationManagerActionId.RemoveZeroBalanceTrackedAssets,
            removeZeroBalanceTrackedAssetsArgs({ assets: [denominationAsset] }),
          ),
      ).rejects.toBeRevertedWith('Cannot remove denomination asset');
    });

    it('does not allow an asset with a non-zero balance', async () => {
      const {
        deployment: { integrationManager, trackedAssetsAdapter },
        config: {
          primitives: { mln },
        },
        fund: { comptrollerProxy, fundOwner, vaultProxy },
      } = await provider.snapshot(snapshot);

      const assetToRemove = new StandardToken(mln, whales.mln);

      // Track the asset to remove and give it a non-zero vault balance
      await addNewAssetsToFund({
        fundOwner,
        comptrollerProxy,
        vaultProxy,
        integrationManager,
        trackedAssetsAdapter,
        assets: [assetToRemove],
        amounts: [1],
      });

      await expect(
        comptrollerProxy
          .connect(fundOwner)
          .callOnExtension(
            integrationManager,
            IntegrationManagerActionId.RemoveZeroBalanceTrackedAssets,
            removeZeroBalanceTrackedAssetsArgs({ assets: [assetToRemove] }),
          ),
      ).rejects.toBeRevertedWith('Balance is not zero');
    });

    it('successfully removes each asset from tracked assets', async () => {
      const {
        deployment: { integrationManager },
        config: {
          primitives: { mln, dai },
        },
        fund: { comptrollerProxy, fundOwner, vaultProxy },
      } = await provider.snapshot(snapshot);

      const assetToRemove1 = new StandardToken(mln, whales.mln);
      const assetToRemove2 = new StandardToken(dai, whales.dai);

      // Add zero-balance assets to the fund
      await comptrollerProxy
        .connect(fundOwner)
        .callOnExtension(
          integrationManager,
          IntegrationManagerActionId.AddZeroBalanceTrackedAssets,
          addZeroBalanceTrackedAssetsArgs({ assets: [assetToRemove1, assetToRemove2] }),
        );

      // Both assets should be tracked
      expect(await vaultProxy.isTrackedAsset(assetToRemove1)).toBe(true);
      expect(await vaultProxy.isTrackedAsset(assetToRemove2)).toBe(true);

      // Remove the assets
      await comptrollerProxy
        .connect(fundOwner)
        .callOnExtension(
          integrationManager,
          IntegrationManagerActionId.RemoveZeroBalanceTrackedAssets,
          removeZeroBalanceTrackedAssetsArgs({ assets: [assetToRemove1, assetToRemove2] }),
        );

      // Both assets should no longer be tracked
      expect(await vaultProxy.isTrackedAsset(assetToRemove1)).toBe(false);
      expect(await vaultProxy.isTrackedAsset(assetToRemove2)).toBe(false);
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
        deployment: { integrationManager, kyberAdapter, uniswapV2Adapter },
      } = await provider.snapshot(snapshot);

      const preAdapters = await integrationManager.getRegisteredAdapters();
      expect(preAdapters).toEqual(expect.arrayContaining([kyberAdapter.address, uniswapV2Adapter.address]));

      const receipt = await integrationManager.deregisterAdapters([kyberAdapter, uniswapV2Adapter]);
      const events = extractEvent(receipt, 'AdapterDeregistered');

      expect(events.length).toBe(2);
      expect(events[0]).toMatchEventArgs({
        adapter: kyberAdapter,
        identifier: expect.objectContaining({
          hash: utils.id('KYBER_NETWORK'),
        }),
      });

      expect(events[1]).toMatchEventArgs({
        adapter: uniswapV2Adapter,
        identifier: expect.objectContaining({
          hash: utils.id('UNISWAP_V2'),
        }),
      });

      const postAdapters = await integrationManager.getRegisteredAdapters();
      expect(postAdapters.includes(kyberAdapter.address)).toBe(false);
      expect(postAdapters.includes(uniswapV2Adapter.address)).toBe(false);
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
        deployment: { integrationManager, kyberAdapter, uniswapV2Adapter },
      } = await provider.snapshot(snapshot);

      await expect(integrationManager.registerAdapters([kyberAdapter, uniswapV2Adapter])).rejects.toBeRevertedWith(
        'Adapter already registered',
      );
    });

    it('correctly handles valid call', async () => {
      const {
        deployment: { integrationManager, kyberAdapter, uniswapV2Adapter },
      } = await provider.snapshot(snapshot);

      await integrationManager.deregisterAdapters([kyberAdapter, uniswapV2Adapter]);
      const receipt = await integrationManager.registerAdapters([kyberAdapter, uniswapV2Adapter]);

      const events = extractEvent(receipt, 'AdapterRegistered');
      expect(events.length).toBe(2);
      expect(events[0]).toMatchEventArgs({
        adapter: kyberAdapter,
        identifier: expect.objectContaining({
          hash: utils.id('KYBER_NETWORK'),
        }),
      });

      expect(events[1]).toMatchEventArgs({
        adapter: uniswapV2Adapter,
        identifier: expect.objectContaining({
          hash: utils.id('UNISWAP_V2'),
        }),
      });

      const getRegisteredAdaptersCall = await integrationManager.getRegisteredAdapters();
      expect(getRegisteredAdaptersCall).toEqual(
        expect.arrayContaining([kyberAdapter.address, uniswapV2Adapter.address]),
      );
    });
  });
});
