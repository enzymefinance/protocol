import { extractEvent, randomAddress } from '@enzymefinance/ethers';
import {
  ComptrollerLib,
  PolicyHook,
  StandardToken,
  validateRuleAddTrackedAssetsArgs,
  VaultLib,
  WETH,
} from '@enzymefinance/protocol';
import {
  addNewAssetsToFund,
  addTrackedAssetsToVault,
  assertEvent,
  createNewFund,
  deployProtocolFixture,
  removeTrackedAssetsFromVault,
} from '@enzymefinance/testutils';
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
  describe('__addTrackedAssetsToVault', () => {
    it('only allows the owner and authorized users', async () => {
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
        addTrackedAssetsToVault({
          signer: fundOwner,
          comptrollerProxy,
          integrationManager,
          assets: [assetToAdd1],
        }),
      ).resolves.toBeReceipt();

      // Call not allowed by the yet-to-be authorized user
      await expect(
        addTrackedAssetsToVault({
          signer: newAuthUser,
          comptrollerProxy,
          integrationManager,
          assets: [assetToAdd2],
        }),
      ).rejects.toBeRevertedWith('Not an authorized user');

      // Set the new auth user
      await integrationManager.connect(fundOwner).addAuthUserForFund(comptrollerProxy, newAuthUser);

      // Call should be allowed for the authorized user
      await expect(
        addTrackedAssetsToVault({
          signer: newAuthUser,
          comptrollerProxy,
          integrationManager,
          assets: [assetToAdd2],
        }),
      ).resolves.toBeReceipt();
    });

    it('does not allow an unsupported asset', async () => {
      const {
        deployment: { integrationManager },
        fund: { comptrollerProxy, fundOwner },
      } = await provider.snapshot(snapshot);

      await expect(
        addTrackedAssetsToVault({
          signer: fundOwner,
          comptrollerProxy,
          integrationManager,
          assets: [randomAddress()],
        }),
      ).rejects.toBeRevertedWith('Unsupported asset');
    });

    it('successfully adds each asset to tracked assets, sets them as persistently tracked, and correctly calls the policy manager', async () => {
      const {
        deployment: { integrationManager, policyManager },
        config: {
          primitives: { mln, dai },
        },
        fund: { comptrollerProxy, fundOwner, vaultProxy },
      } = await provider.snapshot(snapshot);

      // Define assets and whether they should be set as persistently tracked
      const assets = [mln, dai];

      // Neither asset to add should be tracked
      for (const asset of assets) {
        expect(await vaultProxy.isTrackedAsset(asset)).toBe(false);
      }

      // Add the assets
      await addTrackedAssetsToVault({
        signer: fundOwner,
        comptrollerProxy,
        integrationManager,
        assets,
      });

      // Both assets should now be tracked and set as persistently tracked
      for (const i in assets) {
        expect(await vaultProxy.isTrackedAsset(assets[i])).toBe(true);
        expect(await vaultProxy.isPersistentlyTrackedAsset(assets[i])).toBe(true);
      }

      // Assert that the PolicyManager hook was called correctly
      expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
        comptrollerProxy,
        PolicyHook.AddTrackedAssets,
        validateRuleAddTrackedAssetsArgs({
          assets,
        }),
      );
    });
  });

  describe('__removeTrackedAssetsFromVault', () => {
    it('only allows the owner and authorized users', async () => {
      const {
        accounts: [newAuthUser],
        deployment: { integrationManager },
        config: {
          primitives: { mln: assetToRemove1, dai: assetToRemove2 },
        },
        fund: { comptrollerProxy, fundOwner },
      } = await provider.snapshot(snapshot);

      // Add assets to the fund with no balances
      await addTrackedAssetsToVault({
        signer: fundOwner,
        comptrollerProxy,
        integrationManager,
        assets: [assetToRemove1, assetToRemove2],
      });

      // Call to remove an asset should be allowed by the fund owner
      await expect(
        removeTrackedAssetsFromVault({
          signer: fundOwner,
          comptrollerProxy,
          integrationManager,
          assets: [assetToRemove1],
        }),
      ).resolves.toBeReceipt();

      // Call to remove an asset should not be allowed by the yet-to-be authorized user
      await expect(
        removeTrackedAssetsFromVault({
          signer: newAuthUser,
          comptrollerProxy,
          integrationManager,
          assets: [assetToRemove2],
        }),
      ).rejects.toBeRevertedWith('Not an authorized user');

      // Set the new auth user
      await integrationManager.connect(fundOwner).addAuthUserForFund(comptrollerProxy, newAuthUser);

      // Call to remove an asset should now be allowed for the authorized user
      await expect(
        removeTrackedAssetsFromVault({
          signer: newAuthUser,
          comptrollerProxy,
          integrationManager,
          assets: [assetToRemove2],
        }),
      ).resolves.toBeReceipt();
    });

    it('does not allow specifying a denomination asset with a balance of 0', async () => {
      const {
        deployment: { integrationManager },

        fund: { comptrollerProxy, denominationAsset, fundOwner },
      } = await provider.snapshot(snapshot);

      await expect(
        removeTrackedAssetsFromVault({
          signer: fundOwner,
          comptrollerProxy,
          integrationManager,
          assets: [denominationAsset],
        }),
      ).rejects.toBeRevertedWith('Cannot untrack denomination asset');
    });

    it('untracks assets that are either unsupported or has a balance of 0', async () => {
      const {
        deployment: { chainlinkPriceFeed, integrationManager },
        config: {
          primitives: { dai, mln },
        },
        fund: { comptrollerProxy, fundOwner, vaultProxy },
      } = await provider.snapshot(snapshot);

      const assetWithPositiveBalance = new StandardToken(dai, whales.dai);
      const assetWithZeroBalance = new StandardToken(mln, whales.mln);

      // Seed vault with the tracked assets
      await addNewAssetsToFund({
        signer: fundOwner,
        comptrollerProxy,
        integrationManager,
        assets: [assetWithPositiveBalance, assetWithZeroBalance],
        amounts: [1, 0],
      });

      // Both assets should be tracked
      expect(await vaultProxy.isTrackedAsset(assetWithPositiveBalance)).toBe(true);
      expect(await vaultProxy.isTrackedAsset(assetWithZeroBalance)).toBe(true);

      // Removing the asset with a zero balance should succeed
      await removeTrackedAssetsFromVault({
        signer: fundOwner,
        comptrollerProxy,
        integrationManager,
        assets: [assetWithZeroBalance],
      });
      expect(await vaultProxy.isTrackedAsset(assetWithZeroBalance)).toBe(false);

      // Attempting to remove the asset with a positive balance should fail
      await expect(
        removeTrackedAssetsFromVault({
          signer: fundOwner,
          comptrollerProxy,
          integrationManager,
          assets: [assetWithPositiveBalance],
        }),
      ).rejects.toBeRevertedWith('Not allowed');

      // Remove support for the asset with a positive balance
      await chainlinkPriceFeed.removePrimitives([assetWithPositiveBalance]);

      // Removing the unsupported asset with a positive balance should succeed
      await removeTrackedAssetsFromVault({
        signer: fundOwner,
        comptrollerProxy,
        integrationManager,
        assets: [assetWithPositiveBalance],
      });
      expect(await vaultProxy.isTrackedAsset(assetWithPositiveBalance)).toBe(false);
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

      // Add assets to the fund with no balances
      await addTrackedAssetsToVault({
        signer: fundOwner,
        comptrollerProxy,
        integrationManager,
        assets: [assetToRemove1, assetToRemove2],
      });

      // Remove the assets
      removeTrackedAssetsFromVault({
        signer: fundOwner,
        comptrollerProxy,
        integrationManager,
        assets: [assetToRemove1, assetToRemove2],
      });

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
        deployment: { integrationManager, uniswapV2Adapter, compoundAdapter },
      } = await provider.snapshot(snapshot);

      const preAdapters = await integrationManager.getRegisteredAdapters();
      expect(preAdapters).toEqual(expect.arrayContaining([uniswapV2Adapter.address, compoundAdapter.address]));

      const receipt = await integrationManager.deregisterAdapters([uniswapV2Adapter, compoundAdapter]);
      const events = extractEvent(receipt, 'AdapterDeregistered');

      expect(events.length).toBe(2);
      expect(events[0]).toMatchEventArgs({
        adapter: uniswapV2Adapter,
        identifier: expect.objectContaining({
          hash: utils.id('UNISWAP_V2'),
        }),
      });

      expect(events[1]).toMatchEventArgs({
        adapter: compoundAdapter,
        identifier: expect.objectContaining({
          hash: utils.id('COMPOUND'),
        }),
      });

      const postAdapters = await integrationManager.getRegisteredAdapters();
      expect(postAdapters.includes(uniswapV2Adapter.address)).toBe(false);
      expect(postAdapters.includes(compoundAdapter.address)).toBe(false);
      expect(postAdapters.length).toBe(preAdapters.length - 2);
    });

    it('does not allow an unregistered adapter', async () => {
      const {
        deployment: { integrationManager, uniswapV2Adapter },
      } = await provider.snapshot(snapshot);

      await expect(integrationManager.deregisterAdapters([uniswapV2Adapter])).resolves.toBeReceipt();
      await expect(integrationManager.deregisterAdapters([uniswapV2Adapter])).rejects.toBeRevertedWith(
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
        deployment: { integrationManager, uniswapV2Adapter, compoundAdapter },
      } = await provider.snapshot(snapshot);

      await expect(integrationManager.registerAdapters([uniswapV2Adapter, compoundAdapter])).rejects.toBeRevertedWith(
        'Adapter already registered',
      );
    });

    it('correctly handles valid call', async () => {
      const {
        deployment: { integrationManager, uniswapV2Adapter, compoundAdapter },
      } = await provider.snapshot(snapshot);

      await integrationManager.deregisterAdapters([uniswapV2Adapter, compoundAdapter]);
      const receipt = await integrationManager.registerAdapters([uniswapV2Adapter, compoundAdapter]);

      const events = extractEvent(receipt, 'AdapterRegistered');
      expect(events.length).toBe(2);
      expect(events[0]).toMatchEventArgs({
        adapter: uniswapV2Adapter,
        identifier: expect.objectContaining({
          hash: utils.id('UNISWAP_V2'),
        }),
      });

      expect(events[1]).toMatchEventArgs({
        adapter: compoundAdapter,
        identifier: expect.objectContaining({
          hash: utils.id('COMPOUND'),
        }),
      });

      const getRegisteredAdaptersCall = await integrationManager.getRegisteredAdapters();
      expect(getRegisteredAdaptersCall).toEqual(
        expect.arrayContaining([uniswapV2Adapter.address, compoundAdapter.address]),
      );
    });
  });
});
