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
      signer: fundOwner,
      fundOwner,
      fundDeployer,
      denominationAsset: new StandardToken(usdc, provider),
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
        signer: fundOwner,
        comptrollerProxy,
        integrationManager,
        assets,
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
          caller: fundOwner,
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
      await removeTrackedAssetsFromVault({
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
          caller: fundOwner,
          assets: assetsToRemove,
        }),
      );
    });
  });
});
