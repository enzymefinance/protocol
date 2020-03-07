import { BN, toWei, randomHex } from 'web3-utils';
import { deploy } from '~/deploy/utils/deploy-contract';
import web3 from '~/deploy/utils/get-web3';
import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import deployMockSystem from '~/tests/utils/deployMockSystem';

describe('vault', () => {
  let user, defaulTxOpts;
  let mockSystem;
  let vault;

  // Mock data
  const mockExchanges = [ randomHex(20), randomHex(20) ];
  const mockExchangeAdapters = [ randomHex(20), randomHex(20) ];

  beforeAll(async () => {
    const accounts = await web3.eth.getAccounts();
    user = accounts[0];
    defaulTxOpts = { from: user, gas: 8000000 }
    mockSystem = await deployMockSystem();
    for (const i in mockExchanges) {
      await mockSystem.registry.methods
        .registerExchangeAdapter(mockExchanges[i], mockExchangeAdapters[i])
        .send({ from: user, gas: 8000000 });
    }

    vault = await deploy(CONTRACT_NAMES.VAULT, [
      mockSystem.hub.options.address,
      mockExchanges,
      mockExchangeAdapters,
      mockSystem.registry.options.address
    ]);

    await mockSystem.hub.methods
      .setSpokes([
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
      ])
      .send(defaulTxOpts);
    await mockSystem.hub.methods
      .initializeSpoke(vault.options.address)
      .send({ from: user, gas: 8000000 });
  });

  test('Exchanges are properly initialized', async () => {
    for (const i in mockExchanges) {
      const exchangeObject = await vault.methods.exchanges(i).call();
      expect(exchangeObject.exchange.toLowerCase()).toBe(mockExchanges[i]);
      expect(exchangeObject.adapter.toLowerCase()).toBe(mockExchangeAdapters[i]);
      const exchangeAdded = await vault.methods
        .adapterIsAdded(exchangeObject.adapter)
        .call();
      expect(exchangeAdded).toBe(true);
    }
  });

  test('Exchanges cannot be initialized without their adapters', async () => {
    await expect(
      deploy(CONTRACT_NAMES.VAULT, [
        mockSystem.hub.options.address,
        mockExchanges,
        [mockExchangeAdapters[0]],
        mockSystem.registry.options.address
      ], {gas: 8000000})
    ).rejects.toThrow('Array lengths unequal');
  });
});
