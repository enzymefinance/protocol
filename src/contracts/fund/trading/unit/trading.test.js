import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { deployMockSystem } from '~/utils/deploy/deployMockSystem';
import { getContract } from '~/utils/solidity/getContract';
import { deployContract } from '~/utils/solidity/deployContract';
import { BN, toWei, randomHex } from 'web3-utils';
import { CONTRACT_NAMES, EMPTY_ADDRESS } from '~/tests/utils/new/constants';

describe('trading', () => {
  let environment, user, defaulTxOpts;
  let mockSystem;
  let trading;

  // Mock data
  const mockExchanges = [
    randomHex(20),
    randomHex(20),
  ];

  const mockExchangeAdapters = [
    randomHex(20),
    randomHex(20),
  ];

  beforeAll(async () => {
    environment = await initTestEnvironment();
    mockSystem = await deployMockSystem(environment);
    user = environment.wallet.address;
    defaulTxOpts = { from: user, gas: 8000000 }
    for (const i in mockExchanges) {
      await mockSystem.registry.methods
        .registerExchangeAdapter(mockExchanges[i], mockExchangeAdapters[i])
        .send({ from: user });
    }

    trading = getContract(
      environment,
      CONTRACT_NAMES.TRADING,
      await deployContract(environment, CONTRACT_NAMES.TRADING, [
        mockSystem.hub.options.address,
        mockExchanges,
        mockExchangeAdapters,
        mockSystem.registry.options.address,
      ]),
    );

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
        EMPTY_ADDRESS,
      ])
      .send(defaulTxOpts);
    await mockSystem.hub.methods
      .initializeSpoke(trading.options.address)
      .send({ from: user, gas: 8000000 });
  });

  it('Exchanges are properly initialized', async () => {
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

  it('Exchanges cannot be initialized without its adapter', async () => {
    await expect(
      deployContract(environment, CONTRACT_NAMES.TRADING, [
        mockSystem.hub.options.address,
        mockExchanges,
        [mockExchangeAdapters[0]],
        mockSystem.registry.options.address,
      ]),
    ).rejects.toThrow();
  });

  it('returnBatchToVault sends back token balances to the vault', async () => {
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
