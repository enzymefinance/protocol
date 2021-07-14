import { extractEvent, randomAddress } from '@enzymefinance/ethers';
import {
  ComptrollerLib,
  PolicyHook,
  StandardToken,
  validateRuleAddTrackedAssetsArgs,
  validateRuleRemoveTrackedAssetsArgs,
  VaultLib,
  WETH,
} from '@enzymefinance/protocol';
import {
  addTrackedAssetsToVault,
  createNewFund,
  deployProtocolFixture,
  removeTrackedAssetsFromVault,
} from '@enzymefinance/testutils';
import { constants } from 'ethers';

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
      fund: { comptrollerProxy, vaultProxy },
    } = await provider.snapshot(snapshot);

    // Stores the ComptrollerProxy-VaultProxy pairing
    const getVaultProxyForFundCall = await integrationManager.getVaultProxyForFund(comptrollerProxy);

    expect(getVaultProxyForFundCall).toMatchAddress(vaultProxy);
  });
});

describe('callOnExtension actions', () => {
  describe('__addTrackedAssetsToVault', () => {
    it('only allows the owner and asset managers', async () => {
      const {
        accounts: [newAssetManager],
        deployment: { integrationManager },
        config: {
          primitives: { mln: assetToAdd1, dai: assetToAdd2 },
        },
        fund: { comptrollerProxy, fundOwner, vaultProxy },
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

      // Call not allowed by the yet-to-be added asset manager
      await expect(
        addTrackedAssetsToVault({
          signer: newAssetManager,
          comptrollerProxy,
          integrationManager,
          assets: [assetToAdd2],
        }),
      ).rejects.toBeRevertedWith('Unauthorized');

      // Set the new asset manager
      await vaultProxy.connect(fundOwner).addAssetManagers([newAssetManager]);

      // Call should be allowed for the asset manager
      await expect(
        addTrackedAssetsToVault({
          signer: newAssetManager,
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
    it('only allows the owner and asset managers', async () => {
      const {
        accounts: [newAssetManager],
        deployment: { integrationManager },
        config: {
          primitives: { mln: assetToRemove1, dai: assetToRemove2 },
        },
        fund: { comptrollerProxy, fundOwner, vaultProxy },
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

      // Call to remove an asset should not be allowed by the yet-to-be-added asset manager
      await expect(
        removeTrackedAssetsFromVault({
          signer: newAssetManager,
          comptrollerProxy,
          integrationManager,
          assets: [assetToRemove2],
        }),
      ).rejects.toBeRevertedWith('Unauthorized');

      // Set the new asset manager
      await vaultProxy.connect(fundOwner).addAssetManagers([newAssetManager]);

      // Call to remove an asset should now be allowed for the added asset manager
      await expect(
        removeTrackedAssetsFromVault({
          signer: newAssetManager,
          comptrollerProxy,
          integrationManager,
          assets: [assetToRemove2],
        }),
      ).resolves.toBeReceipt();
    });

    it('successfully removes each asset from tracked assets and correctly calls policy validation', async () => {
      const {
        deployment: { integrationManager, policyManager },
        config: {
          primitives: { mln, dai },
        },
        fund: { comptrollerProxy, fundOwner, vaultProxy },
      } = await provider.snapshot(snapshot);

      const assetsToRemove = [new StandardToken(mln, whales.mln), new StandardToken(dai, whales.dai)];

      // Add assets to the fund with no balances
      await addTrackedAssetsToVault({
        signer: fundOwner,
        comptrollerProxy,
        integrationManager,
        assets: assetsToRemove,
      });

      // Remove the assets
      removeTrackedAssetsFromVault({
        signer: fundOwner,
        comptrollerProxy,
        integrationManager,
        assets: assetsToRemove,
      });

      // Both assets should no longer be tracked
      for (const asset of assetsToRemove) {
        expect(await vaultProxy.isTrackedAsset(asset)).toBe(false);
      }

      // Assert that the PolicyManager hook was called correctly
      expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
        comptrollerProxy,
        PolicyHook.RemoveTrackedAssets,
        validateRuleRemoveTrackedAssetsArgs({
          assets: assetsToRemove,
        }),
      );
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
      });

      expect(events[1]).toMatchEventArgs({
        adapter: compoundAdapter,
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
      });

      expect(events[1]).toMatchEventArgs({
        adapter: compoundAdapter,
      });

      const getRegisteredAdaptersCall = await integrationManager.getRegisteredAdapters();
      expect(getRegisteredAdaptersCall).toEqual(
        expect.arrayContaining([uniswapV2Adapter.address, compoundAdapter.address]),
      );
    });
  });
});
