import { BuidlerProvider, Contract } from '@crestproject/crestproject';
import { ethers } from 'ethers';
import { ERC20WithFields } from '../contracts/ERC20WithFields';
import { Hub } from '../contracts/Hub';
import { Registry } from '../contracts/Registry';
import { Vault } from '../contracts/Vault';
import { KyberAdapter } from '../contracts/KyberAdapter';
import { randomAddress } from '../utils';

async function preVaultDeploySnapshot(provider: BuidlerProvider) {
  const [deployer] = await provider.listAccounts();
  const signer = provider.getSigner(deployer);
  const mockAdapter1 = await KyberAdapter.mock(signer);
  const mockAdapter2 = await KyberAdapter.mock(signer);
  const mockAdapter3 = await KyberAdapter.mock(signer);
  const mockAdapter4 = await KyberAdapter.mock(signer);
  const mockAsset1 = await ERC20WithFields.mock(signer);
  const mockAsset2 = await ERC20WithFields.mock(signer);
  const mockHub = await Hub.mock(signer);
  const mockRegistry = await Registry.mock(signer);

  // Set mock config

  await mockHub.REGISTRY.returns(mockRegistry);
  await mockHub.MANAGER.returns(deployer);

  for (const adapter of [
    mockAdapter1,
    mockAdapter2,
    mockAdapter3,
    mockAdapter4,
  ]) {
    await mockRegistry.integrationAdapterIsRegistered
      .given(adapter)
      .returns(false);
  }

  for (const asset of [mockAsset1, mockAsset2]) {
    await mockRegistry.primitiveIsRegistered.given(asset).returns(false);

    await mockRegistry.derivativeToPriceSource
      .given(asset)
      .returns(ethers.constants.AddressZero);

    await asset.decimals.returns(18);
  }

  return {
    deployer,
    mockAdapter1,
    mockAdapter2,
    mockAdapter3,
    mockAdapter4,
    mockAsset1,
    mockAsset2,
    mockHub,
    mockRegistry,
    signer,
  };
}

async function vaultDeployedSnapshot(provider: BuidlerProvider) {
  const prevSnapshot = await preVaultDeploySnapshot(provider);

  // Register the mock adapters, so they can be enabled on the Vault
  for (const adapter of [
    prevSnapshot.mockAdapter1,
    prevSnapshot.mockAdapter2,
    prevSnapshot.mockAdapter3,
    prevSnapshot.mockAdapter4,
  ]) {
    await prevSnapshot.mockRegistry.integrationAdapterIsRegistered
      .given(adapter)
      .returns(true);
  }

  const vault = await Vault.deploy(prevSnapshot.signer, prevSnapshot.mockHub, [
    prevSnapshot.mockAdapter1,
    prevSnapshot.mockAdapter2,
  ]);

  return {
    ...prevSnapshot,
    disabledAdapter1: prevSnapshot.mockAdapter3,
    disabledAdapter2: prevSnapshot.mockAdapter4,
    enabledAdapter1: prevSnapshot.mockAdapter1,
    enabledAdapter2: prevSnapshot.mockAdapter2,
    vault,
  };
}

let tx, res;

describe('Vault', () => {
  describe('constructor', () => {
    it('can deploy without any adapters', async () => {
      const { mockHub, signer } = await provider.snapshot(
        preVaultDeploySnapshot,
      );

      tx = Vault.deploy(signer, mockHub, []);
      await expect(tx).resolves.toBeInstanceOf(Vault);
    });

    it('sets initial storage values', async () => {
      const {
        enabledAdapter1,
        enabledAdapter2,
        mockHub,
        vault,
      } = await provider.snapshot(vaultDeployedSnapshot);

      // storage var: HUB
      tx = vault.HUB();
      await expect(tx).resolves.toBe(mockHub.address);

      // storage var: enabledAdapters
      res = vault.getEnabledAdapters();
      await expect(res).resolves.toMatchObject([
        enabledAdapter1.address,
        enabledAdapter2.address,
      ]);
    });
  });

  describe('callOnIntegration', () => {
    it.todo('can only be called by manager');

    it.todo('fund must be active');

    it.todo('adapter must be enabled');

    it.todo('define additional tests');
  });

  describe('deposit', () => {
    it.todo('define tests');
  });

  describe('disableAdapters', () => {
    it('can only be called by manager', async () => {
      const {
        deployer,
        enabledAdapter1,
        mockHub,
        vault,
      } = await provider.snapshot(vaultDeployedSnapshot);

      // Should fail, due to the sender not being the manager
      await mockHub.MANAGER.returns(randomAddress());
      tx = vault.disableAdapters([enabledAdapter1]);
      await expect(tx).rejects.toBeRevertedWith(
        'Only the fund manager can call this function',
      );

      // Set manager to sender, and it should succeed
      await mockHub.MANAGER.returns(deployer);
      tx = vault.disableAdapters([enabledAdapter1]);
      await expect(tx).resolves.toBeReceipt();
    });

    it('does not allow already disabled adapter', async () => {
      const { disabledAdapter1, vault } = await provider.snapshot(
        vaultDeployedSnapshot,
      );

      tx = vault.disableAdapters([disabledAdapter1]);
      await expect(tx).rejects.toBeRevertedWith('adapter already disabled');
    });

    it.todo('updates state and emits AdapterDisabled events');
  });

  describe('enableAdapters', () => {
    it('does not allow an empty value', async () => {
      const { vault } = await provider.snapshot(vaultDeployedSnapshot);

      tx = vault.enableAdapters([]);
      await expect(tx).rejects.toBeRevertedWith('_adapters cannot be empty');
    });

    it('can only be called by manager', async () => {
      const {
        deployer,
        disabledAdapter1,
        mockHub,
        vault,
      } = await provider.snapshot(vaultDeployedSnapshot);

      // Should fail, due to the sender not being the manager
      await mockHub.MANAGER.returns(randomAddress());
      tx = vault.enableAdapters([disabledAdapter1]);
      await expect(tx).rejects.toBeRevertedWith(
        'Only the fund manager can call this function',
      );

      // Set manager to sender, and it should succeed
      await mockHub.MANAGER.returns(deployer);
      tx = vault.enableAdapters([disabledAdapter1]);
      await expect(tx).resolves.toBeReceipt();
    });

    it('does not allow duplicate value', async () => {
      const { enabledAdapter1, vault } = await provider.snapshot(
        vaultDeployedSnapshot,
      );

      tx = vault.enableAdapters([enabledAdapter1]);
      await expect(tx).rejects.toBeRevertedWith('Adapter is already enabled');
    });

    it('does not allow an un-registered adapter', async () => {
      const { disabledAdapter1, mockRegistry, vault } = await provider.snapshot(
        vaultDeployedSnapshot,
      );

      // Should fail, due to the adapter not being registered
      await mockRegistry.integrationAdapterIsRegistered
        .given(disabledAdapter1)
        .returns(false);
      tx = vault.enableAdapters([disabledAdapter1]);
      await expect(tx).rejects.toBeRevertedWith('Adapter is not on Registry');

      // Register adapter, and it should succeed
      await mockRegistry.integrationAdapterIsRegistered
        .given(disabledAdapter1)
        .returns(true);
      tx = vault.enableAdapters([disabledAdapter1]);
      await expect(tx).resolves.toBeReceipt();
    });

    it.todo('updates state and emits AdapterEnabled events');
  });

  describe('withdraw', () => {
    it.todo('define tests');
  });
});
