import { Contracts } from '~/Contracts';
import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { deployMockSystem } from '~/utils/deploy/deployMockSystem';
import { getContract } from '~/utils/solidity/getContract';
import { deployContract } from '~/utils/solidity/deployContract';
import { emptyAddress } from '~/utils/constants/emptyAddress';
import { randomAddress } from '~/utils/helpers/randomAddress';
import { add, isEqual, BigInteger, power } from '@melonproject/token-math';

describe('trading', () => {
  let shared: any = {};

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
    shared.env = await initTestEnvironment();
    shared = Object.assign(shared, await deployMockSystem(shared.env));
    shared.user = shared.env.wallet.address;
    for (let i = 0; i < mockExchanges.length; i = i + 1) {
      await shared.registry.methods
        .registerExchangeAdapter(mockExchanges[i], mockExchangeAdapters[i])
        .send({ from: shared.user });
    }

    shared.trading = getContract(
      shared.env,
      Contracts.Trading,
      await deployContract(shared.env, Contracts.Trading, [
        shared.hub.options.address,
        mockExchanges,
        mockExchangeAdapters,
        shared.registry.options.address,
      ]),
    );
    await shared.hub.methods
      .setSpokes([
        emptyAddress,
        emptyAddress,
        emptyAddress,
        emptyAddress,
        emptyAddress,
        emptyAddress,
        shared.vault.options.address,
        emptyAddress,
        emptyAddress,
        emptyAddress,
        emptyAddress,
        emptyAddress,
      ])
      .send({ from: shared.user, gas: 8000000 });
    await shared.hub.methods
      .initializeSpoke(shared.trading.options.address)
      .send({ from: shared.user, gas: 8000000 });
  });

  it('Exchanges are properly initialized', async () => {
    for (const i of Array.from(Array(mockExchanges.length).keys())) {
      const exchangeObject = await shared.trading.methods.exchanges(i).call();
      expect(exchangeObject.exchange).toBe(mockExchanges[i]);
      expect(exchangeObject.adapter).toBe(mockExchangeAdapters[i]);
      const exchangeAdded = await shared.trading.methods
        .adapterIsAdded(exchangeObject.adapter)
        .call();
      expect(exchangeAdded).toBe(true);
    }
  });

  it('Exchanges cannot be initialized without its adapter', async () => {
    const errorMessage = 'Array lengths unequal';
    await expect(
      deployContract(shared.env, Contracts.Trading, [
        shared.hub.options.address,
        mockExchanges,
        [mockExchangeAdapters[0]],
        shared.registry.options.address,
      ]),
    ).rejects.toThrow(errorMessage);
  });

  it('returnBatchToVault sends back token balances to the vault', async () => {
    const tokenQuantity = power(new BigInteger(10), new BigInteger(20));

    await shared.mln.methods
      .transfer(shared.trading.options.address, `${tokenQuantity}`)
      .send({ from: shared.user, gas: 8000000 });
    await shared.weth.methods
      .transfer(shared.trading.options.address, `${tokenQuantity}`)
      .send({ from: shared.user, gas: 8000000 });

    const preMlnVault = new BigInteger(
      await shared.mln.methods.balanceOf(shared.vault.options.address).call(),
    );
    const preWethVault = new BigInteger(
      await shared.weth.methods.balanceOf(shared.vault.options.address).call(),
    );

    await shared.trading.methods
      .returnBatchToVault([
        shared.mln.options.address,
        shared.weth.options.address,
      ])
      .send({ from: shared.user, gas: 8000000 });

    const postMlnTrading = new BigInteger(
      await shared.mln.methods.balanceOf(shared.trading.options.address).call(),
    );
    const postWethTrading = new BigInteger(
      await shared.weth.methods
        .balanceOf(shared.trading.options.address)
        .call(),
    );
    const postMlnVault = new BigInteger(
      await shared.mln.methods.balanceOf(shared.vault.options.address).call(),
    );
    const postWethVault = new BigInteger(
      await shared.weth.methods.balanceOf(shared.vault.options.address).call(),
    );

    expect(isEqual(postMlnTrading, new BigInteger(0))).toBe(true);
    expect(isEqual(postWethTrading, new BigInteger(0))).toBe(true);
    expect(isEqual(postMlnVault, add(preMlnVault, tokenQuantity))).toBe(true);
    expect(isEqual(postWethVault, add(preWethVault, tokenQuantity))).toBe(true);
  });
});
