import { Contracts } from '~/Contracts';
import { initTestEnvironment } from '~/utils/environment';
import { deployMockSystem } from '~/utils';
import { deploy, getContract } from '~/utils/solidity';
import { emptyAddress } from '~/utils/constants';
import { randomAddress } from '~/utils/helpers';
import { share } from 'rxjs/operators';
import { BigNumber } from 'bignumber.js';

let shared: any = {};

// Mock data
const mockExchanges = [randomAddress(), randomAddress()];

const mockExchangeAdapters = [randomAddress(), randomAddress()];

const takesCustodyMasks = [true, false];

beforeAll(async () => {
  shared.env = await initTestEnvironment();
  shared = Object.assign(shared, await deployMockSystem());
  shared.user = shared.env.wallet.address;
  shared.trading = getContract(
    Contracts.Trading,
    await deploy(Contracts.Trading, [
      shared.hub.options.address,
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
    expect(exchangeObject.exchange.toLowerCase()).toBe(mockExchanges[i]);
    expect(exchangeObject.adapter.toLowerCase()).toBe(mockExchangeAdapters[i]);
    expect(exchangeObject.takesCustody).toBe(takesCustodyMasks[i]);
    await expect(
      shared.trading.methods.exchangeIsAdded(mockExchanges[i]).call(),
    ).toBeTruthy();
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
  const tokenQuantity = new BigNumber(10 ** 20);
  await shared.mln.methods
    .transfer(shared.trading.options.address, new BigNumber(10 ** 20).toFixed())
    .send({ from: shared.user, gas: 8000000 });
  await shared.weth.methods
    .transfer(shared.trading.options.address, new BigNumber(10 ** 20).toFixed())
    .send({ from: shared.user, gas: 8000000 });

  const preMlnTrading = new BigNumber(
    await shared.mln.methods.balanceOf(shared.trading.options.address).call(),
  );
  const preWethTrading = new BigNumber(
    await shared.weth.methods.balanceOf(shared.trading.options.address).call(),
  );
  const preMlnVault = new BigNumber(
    await shared.mln.methods.balanceOf(shared.vault.options.address).call(),
  );
  const preWethVault = new BigNumber(
    await shared.weth.methods.balanceOf(shared.vault.options.address).call(),
  );

  await shared.trading.methods
    .returnToVault([shared.mln.options.address, shared.weth.options.address])
    .send({ from: shared.user, gas: 8000000 });

  const postMlnTrading = new BigNumber(
    await shared.mln.methods.balanceOf(shared.trading.options.address).call(),
  );
  const postWethTrading = new BigNumber(
    await shared.weth.methods.balanceOf(shared.trading.options.address).call(),
  );
  const postMlnVault = new BigNumber(
    await shared.mln.methods.balanceOf(shared.vault.options.address).call(),
  );
  const postWethVault = new BigNumber(
    await shared.weth.methods.balanceOf(shared.vault.options.address).call(),
  );

  expect(postMlnTrading).toEqual(new BigNumber(0));
  expect(postWethTrading).toEqual(new BigNumber(0));
  expect(postMlnVault).toEqual(preMlnVault.add(tokenQuantity));
  expect(postWethVault).toEqual(preWethVault.add(tokenQuantity));
});
