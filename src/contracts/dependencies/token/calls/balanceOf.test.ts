import {
  createQuantity,
  isEqual,
  QuantityInterface,
} from '@melonproject/token-math/quantity';
import { Address } from '@melonproject/token-math/address';
import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { balanceOf } from '../calls/balanceOf';
import { getToken } from '../calls/getToken';
import { deployToken } from '../transactions/deploy';
import { transfer } from '../transactions/transfer';

const shared: any = {};

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

beforeAll(async () => {
  shared.env = await initTestEnvironment();
  shared.address = await deployToken(shared.env);
  shared.token = await getToken(shared.env, shared.address);
  shared.accounts = (await shared.env.eth.getAccounts()).map(
    account => new Address(account),
  );
});

it('balanceOf', async () => {
  const balance = await balanceOf(shared.env, shared.address, {
    address: shared.accounts[0],
  });

  const expected = createQuantity(shared.token, '1000000000000000000000000');

  expect(isEqual(balance, expected)).toBe(true);
});

it('balanceOf.observable', async () => {
  let counter = 0;
  const observable = balanceOf.observable(shared.env, shared.address, {
    address: shared.accounts[1],
  });

  observable.subscribe((balance: QuantityInterface) => {
    counter += 1;
    if (counter === 2) {
      const expected = createQuantity(shared.token, '2000000000000000000');
      expect(isEqual(balance, expected)).toBe(true);
    }
  });

  await transfer(shared.env, {
    howMuch: createQuantity(shared.token, '1000000000000000000'),
    to: shared.accounts[1],
  });

  await transfer(shared.env, {
    howMuch: createQuantity(shared.token, '1000000000000000000'),
    to: shared.accounts[1],
  });

  await transfer(shared.env, {
    howMuch: createQuantity(shared.token, '1000000000000000000'),
    to: shared.accounts[2],
  });

  await delay(2000);
  expect(counter).toBe(2);
});
