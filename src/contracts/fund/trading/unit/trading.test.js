import { Contracts } from '~/Contracts';
import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { deployMockSystem } from '~/utils/deploy/deployMockSystem';
import { getContract } from '~/utils/solidity/getContract';
import { deployContract } from '~/utils/solidity/deployContract';
import { emptyAddress } from '~/utils/constants/emptyAddress';
import { randomAddress } from '~/utils/helpers/randomAddress';
import { add, isEqual, BigInteger } from '@melonproject/token-math';

describe('trading', () => {
  let environment, user, defaulTxOpts;
  let mockSystem;
  let trading;

  // Mock data
  const mockExchanges = [
    randomAddress().toString(),
    randomAddress().toString(),
  ];

  const mockExchangeAdapters = [
    randomAddress().toString(),
    randomAddress().toString(),
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
      Contracts.Trading,
      await deployContract(environment, Contracts.Trading, [
        mockSystem.hub.options.address,
        mockExchanges,
        mockExchangeAdapters,
        mockSystem.registry.options.address,
      ]),
    );

    await mockSystem.hub.methods
      .setSpokes([
        emptyAddress,
        emptyAddress,
        emptyAddress,
        emptyAddress,
        emptyAddress,
        emptyAddress,
        mockSystem.vault.options.address,
        emptyAddress,
        emptyAddress,
        emptyAddress,
        emptyAddress,
        emptyAddress,
      ])
      .send(defaulTxOpts);
    await mockSystem.hub.methods
      .initializeSpoke(trading.options.address)
      .send({ from: user, gas: 8000000 });
  });

  it('Exchanges are properly initialized', async () => {
    for (const i in mockExchanges) {
      const exchangeObject = await trading.methods.exchanges(i).call();
      expect(exchangeObject.exchange).toBe(mockExchanges[i]);
      expect(exchangeObject.adapter).toBe(mockExchangeAdapters[i]);
      const exchangeAdded = await trading.methods
        .adapterIsAdded(exchangeObject.adapter)
        .call();
      expect(exchangeAdded).toBe(true);
    }
  });

  it('Exchanges cannot be initialized without its adapter', async () => {
    const errorMessage = 'Array lengths unequal';
    await expect(
      deployContract(environment, Contracts.Trading, [
        mockSystem.hub.options.address,
        mockExchanges,
        [mockExchangeAdapters[0]],
        mockSystem.registry.options.address,
      ]),
    ).rejects.toThrow(errorMessage);
  });

  it('returnBatchToVault sends back token balances to the vault', async () => {
    const tokenQuantity = new BigInteger(10 ** 20);

    await mockSystem.mln.methods
      .transfer(trading.options.address, `${tokenQuantity}`)
      .send(defaulTxOpts);
    await mockSystem.weth.methods
      .transfer(trading.options.address, `${tokenQuantity}`)
      .send(defaulTxOpts);

    const preMlnVault = new BigInteger(
      await mockSystem.mln.methods.balanceOf(mockSystem.vault.options.address).call(),
    );
    const preWethVault = new BigInteger(
      await mockSystem.weth.methods.balanceOf(mockSystem.vault.options.address).call(),
    );

    await trading.methods
      .returnBatchToVault([
        mockSystem.mln.options.address,
        mockSystem.weth.options.address,
      ])
      .send(defaulTxOpts);

    const postMlnTrading = new BigInteger(
      await mockSystem.mln.methods.balanceOf(trading.options.address).call(),
    );
    const postWethTrading = new BigInteger(
      await mockSystem.weth.methods
        .balanceOf(trading.options.address)
        .call(),
    );
    const postMlnVault = new BigInteger(
      await mockSystem.mln.methods.balanceOf(mockSystem.vault.options.address).call(),
    );
    const postWethVault = new BigInteger(
      await mockSystem.weth.methods.balanceOf(mockSystem.vault.options.address).call(),
    );

    expect(isEqual(postMlnTrading, new BigInteger(0))).toBe(true);
    expect(isEqual(postWethTrading, new BigInteger(0))).toBe(true);
    expect(isEqual(postMlnVault, add(preMlnVault, tokenQuantity))).toBe(true);
    expect(isEqual(postWethVault, add(preWethVault, tokenQuantity))).toBe(true);
  });
});
