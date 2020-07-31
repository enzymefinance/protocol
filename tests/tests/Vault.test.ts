import { BuidlerProvider, randomAddress } from '@crestproject/crestproject';
import { configureTestDeployment } from '../deployment';
import * as contracts from '../contracts';

let tx;

describe('Vault', () => {
  const snapshot = async (provider: BuidlerProvider) => {
    const deployment = await provider.snapshot(configureTestDeployment());
    const hub = await contracts.Hub.mock(deployment.config.deployer);
    await hub.REGISTRY.returns(deployment.system.registry);
    await hub.MANAGER.returns(deployment.config.deployer);

    return { ...deployment, hub };
  };

  describe('constructor', () => {
    it('can deploy without any adapters', async () => {
      const {
        hub,
        config: { deployer },
      } = await provider.snapshot(snapshot);

      tx = contracts.Vault.deploy(deployer, hub, []);
      await expect(tx).resolves.toBeInstanceOf(contracts.Vault);
    });

    it('sets initial storage values', async () => {
      const {
        hub,
        config: { deployer },
        system: { kyberAdapter, uniswapAdapter },
      } = await provider.snapshot(snapshot);

      const vault = await contracts.Vault.deploy(deployer, hub, [
        kyberAdapter,
        uniswapAdapter,
      ]);

      // storage var: HUB
      tx = vault.HUB();
      await expect(tx).resolves.toBe(hub.address);

      // storage var: enabledAdapters
      tx = vault.getEnabledAdapters();
      await expect(tx).resolves.toMatchObject([
        kyberAdapter.address,
        uniswapAdapter.address,
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
        hub,
        config: { deployer },
        system: { kyberAdapter, uniswapAdapter },
      } = await provider.snapshot(snapshot);

      const vault = await contracts.Vault.deploy(deployer, hub, [
        kyberAdapter,
        uniswapAdapter,
      ]);

      // Should fail, due to the sender not being the manager
      await hub.MANAGER.returns(randomAddress());
      tx = vault.disableAdapters([kyberAdapter]);
      await expect(tx).rejects.toBeRevertedWith(
        'Only the fund manager can call this function',
      );

      // Set manager to sender, and it should succeed
      await hub.MANAGER.returns(deployer);
      tx = vault.disableAdapters([kyberAdapter]);
      await expect(tx).resolves.toBeReceipt();
    });

    it('does not allow already disabled adapter', async () => {
      const {
        hub,
        config: { deployer },
        system: { kyberAdapter, uniswapAdapter },
      } = await provider.snapshot(snapshot);

      const vault = await contracts.Vault.deploy(deployer, hub, [kyberAdapter]);
      tx = vault.disableAdapters([uniswapAdapter]);
      await expect(tx).rejects.toBeRevertedWith('adapter already disabled');
    });

    it.todo('updates state and emits AdapterDisabled events');
  });

  describe('enableAdapters', () => {
    it('does not allow an empty value', async () => {
      const {
        hub,
        config: { deployer },
      } = await provider.snapshot(snapshot);

      const vault = await contracts.Vault.deploy(deployer, hub, []);
      tx = vault.enableAdapters([]);
      await expect(tx).rejects.toBeRevertedWith('_adapters cannot be empty');
    });

    it('can only be called by manager', async () => {
      const {
        hub,
        config: { deployer },
        system: { kyberAdapter, uniswapAdapter },
      } = await provider.snapshot(snapshot);

      const vault = await contracts.Vault.deploy(deployer, hub, [kyberAdapter]);

      // Should fail, due to the sender not being the manager
      await hub.MANAGER.returns(randomAddress());
      tx = vault.enableAdapters([uniswapAdapter]);
      await expect(tx).rejects.toBeRevertedWith(
        'Only the fund manager can call this function',
      );

      // Set manager to sender, and it should succeed
      await hub.MANAGER.returns(deployer);
      tx = vault.enableAdapters([uniswapAdapter]);
      await expect(tx).resolves.toBeReceipt();
    });

    it('does not allow duplicate value', async () => {
      const {
        hub,
        config: { deployer },
        system: { kyberAdapter },
      } = await provider.snapshot(snapshot);

      const vault = await contracts.Vault.deploy(deployer, hub, [kyberAdapter]);
      tx = vault.enableAdapters([kyberAdapter]);
      await expect(tx).rejects.toBeRevertedWith('Adapter is already enabled');
    });

    it('does not allow an un-registered adapter', async () => {
      const {
        hub,
        config: { deployer },
        system: { kyberAdapter, uniswapAdapter },
      } = await provider.snapshot(snapshot);

      const vault = await contracts.Vault.deploy(deployer, hub, [kyberAdapter]);

      // Should fail, due to the adapter not being registered
      tx = vault.enableAdapters([randomAddress()]);
      await expect(tx).rejects.toBeRevertedWith('Adapter is not on Registry');

      // Register adapter, and it should succeed
      tx = vault.enableAdapters([uniswapAdapter]);
      await expect(tx).resolves.toBeReceipt();
    });

    it.todo('updates state and emits AdapterEnabled events');
  });

  describe('withdraw', () => {
    it.todo('define tests');
  });
});
