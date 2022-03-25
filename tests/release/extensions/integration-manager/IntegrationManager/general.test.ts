import { randomAddress } from '@enzymefinance/ethers';
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
    denominationAsset,
    fundDeployer: deployment.fundDeployer,
    fundOwner,
    signer: deployer,
  });

  // Deploy connected mocks for ComptrollerProxy and VaultProxy
  const mockComptrollerProxy = await ComptrollerLib.mock(deployer);
  const mockVaultProxy = await VaultLib.mock(deployer);

  await mockVaultProxy.getAccessor.returns(mockComptrollerProxy);
  await mockComptrollerProxy.getVaultProxy.returns(mockVaultProxy);

  return {
    accounts: remainingAccounts,
    config,
    deployment,
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
      deployment: { integrationManager, fundDeployer, policyManager, valueInterpreter },
    } = await provider.snapshot(snapshot);

    expect(await integrationManager.getFundDeployer()).toMatchAddress(fundDeployer);
    expect(await integrationManager.getPolicyManager()).toMatchAddress(policyManager);
    expect(await integrationManager.getValueInterpreter()).toMatchAddress(valueInterpreter);
  });
});

describe('setConfigForFund', () => {
  it('does not allow a random caller', async () => {
    const {
      accounts: [randomUser],
      deployment: { integrationManager },
    } = await provider.snapshot(snapshot);

    await expect(
      integrationManager.connect(randomUser).setConfigForFund(constants.AddressZero, constants.AddressZero, '0x'),
    ).rejects.toBeRevertedWith('Only the FundDeployer can make this call');
  });

  it('happy path', async () => {
    const {
      accounts: [fundOwner],
      deployment: { integrationManager, fundDeployer },
      config: {
        primitives: { usdc },
      },
    } = await provider.snapshot(snapshot);

    const { comptrollerProxy, vaultProxy } = await createNewFund({
      denominationAsset: new StandardToken(usdc, provider),
      fundDeployer,
      fundOwner,
      signer: fundOwner,
    });

    // Assert state
    expect(await integrationManager.getVaultProxyForFund(comptrollerProxy)).toMatchAddress(vaultProxy);
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
          assets: [assetToAdd1],
          comptrollerProxy,
          integrationManager,
          signer: fundOwner,
        }),
      ).resolves.toBeReceipt();

      // Call not allowed by the yet-to-be added asset manager
      await expect(
        addTrackedAssetsToVault({
          assets: [assetToAdd2],
          comptrollerProxy,
          integrationManager,
          signer: newAssetManager,
        }),
      ).rejects.toBeRevertedWith('Unauthorized');

      // Set the new asset manager
      await vaultProxy.connect(fundOwner).addAssetManagers([newAssetManager]);

      // Call should be allowed for the asset manager
      await expect(
        addTrackedAssetsToVault({
          assets: [assetToAdd2],
          comptrollerProxy,
          integrationManager,
          signer: newAssetManager,
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
          assets: [randomAddress()],
          comptrollerProxy,
          integrationManager,
          signer: fundOwner,
        }),
      ).rejects.toBeRevertedWith('Unsupported asset');
    });

    it('successfully adds each asset to tracked assets, and correctly calls the policy manager', async () => {
      const {
        deployment: { integrationManager, policyManager },
        config: {
          primitives: { mln, dai },
        },
        fund: { comptrollerProxy, fundOwner, vaultProxy },
      } = await provider.snapshot(snapshot);

      const assets = [mln, dai];

      // Neither asset to add should be tracked
      for (const asset of assets) {
        expect(await vaultProxy.isTrackedAsset(asset)).toBe(false);
      }

      // Add the assets
      await addTrackedAssetsToVault({
        assets,
        comptrollerProxy,
        integrationManager,
        signer: fundOwner,
      });

      // Both assets should now be tracked
      for (const i in assets) {
        expect(await vaultProxy.isTrackedAsset(assets[i])).toBe(true);
      }

      // Assert that the PolicyManager hook was called correctly
      expect(policyManager.validatePolicies).toHaveBeenCalledOnContractWith(
        comptrollerProxy,
        PolicyHook.AddTrackedAssets,
        validateRuleAddTrackedAssetsArgs({
          assets,
          caller: fundOwner,
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
        assets: [assetToRemove1, assetToRemove2],
        comptrollerProxy,
        integrationManager,
        signer: fundOwner,
      });

      // Call to remove an asset should be allowed by the fund owner
      await expect(
        removeTrackedAssetsFromVault({
          assets: [assetToRemove1],
          comptrollerProxy,
          integrationManager,
          signer: fundOwner,
        }),
      ).resolves.toBeReceipt();

      // Call to remove an asset should not be allowed by the yet-to-be-added asset manager
      await expect(
        removeTrackedAssetsFromVault({
          assets: [assetToRemove2],
          comptrollerProxy,
          integrationManager,
          signer: newAssetManager,
        }),
      ).rejects.toBeRevertedWith('Unauthorized');

      // Set the new asset manager
      await vaultProxy.connect(fundOwner).addAssetManagers([newAssetManager]);

      // Call to remove an asset should now be allowed for the added asset manager
      await expect(
        removeTrackedAssetsFromVault({
          assets: [assetToRemove2],
          comptrollerProxy,
          integrationManager,
          signer: newAssetManager,
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
        assets: assetsToRemove,
        comptrollerProxy,
        integrationManager,
        signer: fundOwner,
      });

      // Remove the assets
      await removeTrackedAssetsFromVault({
        assets: assetsToRemove,
        comptrollerProxy,
        integrationManager,
        signer: fundOwner,
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
          caller: fundOwner,
        }),
      );
    });
  });
});
