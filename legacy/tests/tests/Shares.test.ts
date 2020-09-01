import { BuidlerProvider, randomAddress } from '@crestproject/crestproject';
import { deployTestEnvironment } from '../deployment';
import * as contracts from '../contracts';

let tx;

async function snapshot(provider: BuidlerProvider) {
  const deployment = await deployTestEnvironment(provider);
  const hub = await contracts.Hub.mock(deployment.config.deployer);
  await hub.REGISTRY.returns(deployment.system.registry);
  await hub.MANAGER.returns(deployment.config.deployer);

  return { ...deployment, hub };
}

describe('Shares', () => {
  describe('constructor', () => {
    it('cannot set a non-primitive asset as denomination asset', async () => {
      const {
        hub,
        system: { registry },
        config: { deployer },
      } = await provider.snapshot(snapshot);
      const denomination = randomAddress();

      // Should fail, due to the denomination asset not being registered
      tx = contracts.Shares.deploy(deployer, hub, denomination, 'shares');
      await expect(tx).rejects.toBeRevertedWith(
        'Denomination asset must be registered',
      );

      // Register denomination asset, and it should succeed
      await registry.registerPrimitive(denomination);
      tx = contracts.Shares.deploy(deployer, hub, denomination, 'shares');
      await expect(tx).resolves.toBeInstanceOf(contracts.Shares);
    });

    it('sets initial storage values', async () => {
      const {
        hub,
        config: { deployer, weth },
      } = await provider.snapshot(snapshot);

      const name = 'My Shares';
      const shares = await contracts.Shares.deploy(deployer, hub, weth, name);

      tx = shares.HUB();
      await expect(tx).resolves.toBe(hub.address);

      tx = shares.DENOMINATION_ASSET();
      await expect(tx).resolves.toBe(weth.address);

      tx = shares.name();
      await expect(tx).resolves.toBe(name);

      tx = shares.symbol();
      await expect(tx).resolves.toBe('MLNF');

      tx = shares.decimals();
      await expect(tx).resolves.toBe(18);
    });
  });

  describe('buyShares', () => {
    it.todo('can only be called by SharesRequestor');

    it.todo('reverts if _minSharesQuantity is not met');

    it.todo('deducts owed fees');

    it.todo('updates state and emits SharesBought');
  });

  describe('__redeemShares', () => {
    it.todo('reverts if a user does not have enough shares');

    it.todo('reverts if the fund has no assets');

    it.todo('reverts with a bad asset transfer function');

    it.todo('deducts owed fees');

    it.todo('updates state and emits SharesBought');
  });
});
