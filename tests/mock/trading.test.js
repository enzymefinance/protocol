import { BN, toWei, randomHex } from 'web3-utils';
import { deploy } from '~/deploy/utils/deploy-contract';
import web3 from '~/deploy/utils/get-web3';
import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/constants';
import deployMockSystem from '~/tests/utils/deployMockSystem';

describe('trading', () => {
  let user, defaulTxOpts;
  let mockSystem;
  let trading;

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

    trading = await deploy(CONTRACT_NAMES.TRADING, [
      mockSystem.hub.options.address,
      mockExchanges,
      mockExchangeAdapters,
      mockSystem.registry.options.address,
    ]);

    await mockSystem.hub.methods
      .setSpokes([
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        mockSystem.vault.options.address,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
        EMPTY_ADDRESS,
      ])
      .send(defaulTxOpts);
    await mockSystem.hub.methods
      .initializeSpoke(trading.options.address)
      .send({ from: user, gas: 8000000 });
  });

  test('Exchanges are properly initialized', async () => {
    for (const i in mockExchanges) {
      const exchangeObject = await trading.methods.exchanges(i).call();
      expect(exchangeObject.exchange.toLowerCase()).toBe(mockExchanges[i]);
      expect(exchangeObject.adapter.toLowerCase()).toBe(mockExchangeAdapters[i]);
      const exchangeAdded = await trading.methods
        .adapterIsAdded(exchangeObject.adapter)
        .call();
      expect(exchangeAdded).toBe(true);
    }
  });

  test('Exchanges cannot be initialized without their adapters', async () => {
    await expect(
      deploy(CONTRACT_NAMES.TRADING, [
        mockSystem.hub.options.address,
        mockExchanges,
        [mockExchangeAdapters[0]],
        mockSystem.registry.options.address,
      ], {gas: 8000000})
    ).rejects.toThrow('Array lengths unequal');
  });

  test('returnBatchToVault sends back token balances to the vault', async () => {
    const tokenQuantity = new BN(toWei('1', 'Ether'));

    await mockSystem.mln.methods
      .transfer(trading.options.address, `${tokenQuantity}`)
      .send(defaulTxOpts);
    await mockSystem.weth.methods
      .transfer(trading.options.address, `${tokenQuantity}`)
      .send(defaulTxOpts);

    const preMlnVault = new BN(
      await mockSystem.mln.methods.balanceOf(mockSystem.vault.options.address).call(),
    );
    const preWethVault = new BN(
      await mockSystem.weth.methods.balanceOf(mockSystem.vault.options.address).call(),
    );

    await trading.methods
      .returnBatchToVault([
        mockSystem.mln.options.address,
        mockSystem.weth.options.address,
      ])
      .send(defaulTxOpts);

    const postMlnTrading = new BN(
      await mockSystem.mln.methods.balanceOf(trading.options.address).call(),
    );
    const postWethTrading = new BN(
      await mockSystem.weth.methods
        .balanceOf(trading.options.address)
        .call(),
    );
    const postMlnVault = new BN(
      await mockSystem.mln.methods.balanceOf(mockSystem.vault.options.address).call(),
    );
    const postWethVault = new BN(
      await mockSystem.weth.methods.balanceOf(mockSystem.vault.options.address).call(),
    );

    expect(postMlnTrading.isZero()).toBe(true);
    expect(postWethTrading.isZero()).toBe(true);
    expect(postMlnVault.eq(preMlnVault.add(tokenQuantity))).toBe(true);
    expect(postWethVault.eq(preWethVault.add(tokenQuantity))).toBe(true);
  });
});
