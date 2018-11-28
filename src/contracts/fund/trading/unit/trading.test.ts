import { Contracts } from '~/Contracts';
import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { deployMockSystem } from '~/utils/deployMockSystem';
import { getContract } from '~/utils/solidity/getContract';
import { deploy } from '~/utils/solidity/deploy';
import { emptyAddress } from '~/utils/constants/emptyAddress';
import { randomAddress } from '~/utils/helpers/randomAddress';
import { add, isEqual, BigInteger } from '@melonproject/token-math/bigInteger';

let shared: any = {};

// Mock data
const mockExchanges = [randomAddress().toString(), randomAddress().toString()];

const mockExchangeAdapters = [
  randomAddress().toString(),
  randomAddress().toString(),
];

const takesCustodyMasks = [true, false];

beforeAll(async () => {
  shared.env = await initTestEnvironment();
  shared = Object.assign(shared, await deployMockSystem());
  shared.user = shared.env.wallet.address;
  shared.trading = getContract(
    Contracts.Trading,
    await deploy(Contracts.Trading, [
      shared.user, // faked for testing
      mockExchanges,
      mockExchangeAdapters,
      takesCustodyMasks,
    ]),
  );
  await shared.trading.methods
    .initialize([
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
});

test('Exchanges are properly initialized', async () => {
  for (const i of Array.from(Array(mockExchanges.length).keys())) {
    const exchangeObject = await shared.trading.methods.exchanges(i).call();
    expect(exchangeObject.exchange).toBe(mockExchanges[i]);
    expect(exchangeObject.adapter).toBe(mockExchangeAdapters[i]);
    expect(exchangeObject.takesCustody).toBe(takesCustodyMasks[i]);
    const exchangeAdded = await shared.trading.methods
      .exchangeIsAdded(mockExchanges[i])
      .call();
    expect(exchangeAdded).toBe(true);
  }
});

test('Exchanges cant be initialized without its adapter', async () => {
  const errorMessage = 'Array lengths unequal';
  await expect(
    deploy(Contracts.Trading, [
      shared.hub.options.address,
      mockExchanges,
      [mockExchangeAdapters[0]],
      takesCustodyMasks,
    ]),
  ).rejects.toThrow(errorMessage);
});

test('returnToVault sends back token balances to the vault', async () => {
  const tokenQuantity = new BigInteger(10 ** 20);

  await shared.mln.methods
    .transfer(shared.trading.options.address, `${tokenQuantity}`)
    .send({ from: shared.user, gas: 8000000 });
  await shared.weth.methods
    .transfer(shared.trading.options.address, `${tokenQuantity}`)
    .send({ from: shared.user, gas: 8000000 });

  // const preMlnTrading = new BigInteger(
  //   await shared.mln.methods.balanceOf(shared.trading.options.address).call(),
  // );
  // const preWethTrading = new BigInteger(
  //   await shared.weth.methods.balanceOf(shared.trading.options.address).call(),
  // );

  const preMlnVault = new BigInteger(
    await shared.mln.methods.balanceOf(shared.vault.options.address).call(),
  );
  const preWethVault = new BigInteger(
    await shared.weth.methods.balanceOf(shared.vault.options.address).call(),
  );

  await shared.trading.methods
    .returnToVault([shared.mln.options.address, shared.weth.options.address])
    .send({ from: shared.user, gas: 8000000 });

  const postMlnTrading = new BigInteger(
    await shared.mln.methods.balanceOf(shared.trading.options.address).call(),
  );
  const postWethTrading = new BigInteger(
    await shared.weth.methods.balanceOf(shared.trading.options.address).call(),
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
