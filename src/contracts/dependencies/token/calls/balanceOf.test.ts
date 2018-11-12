import {
  createQuantity,
  isEqual,
  QuantityInterface,
} from '@melonproject/token-math/quantity';

import { initTestEnvironment, getGlobalEnvironment } from '~/utils/environment';

import { deploy, balanceOf, getToken } from '..';
import { Address } from '~/utils';
import { transfer } from '../transactions/transfer';

const shared: any = {};

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

beforeAll(async () => {
  await initTestEnvironment();
  const environment = getGlobalEnvironment();

  shared.address = await deploy();
  shared.token = await getToken(shared.address);
  shared.accounts = (await environment.eth.getAccounts()).map(
    account => new Address(account),
  );
});

test('balanceOf', async () => {
  const balance = await balanceOf(shared.address, {
    address: shared.accounts[0],
  });

  const expected = createQuantity(shared.token, '1000000000000000000000000');

  expect(isEqual(balance, expected)).toBe(true);
});

test('balanceOf.observable', async () => {
  let counter = 0;
  const observable = balanceOf.observable(shared.address, {
    address: shared.accounts[1],
  });

  observable.subscribe((balance: QuantityInterface) => {
    counter += 1;
    if (counter === 2) {
      const expected = createQuantity(shared.token, '2000000000000000000');
      expect(isEqual(balance, expected)).toBe(true);
    }
  });

  await transfer({
    howMuch: createQuantity(shared.token, '1000000000000000000'),
    to: shared.accounts[1],
  });

  await transfer({
    howMuch: createQuantity(shared.token, '1000000000000000000'),
    to: shared.accounts[1],
  });

  await transfer({
    howMuch: createQuantity(shared.token, '1000000000000000000'),
    to: shared.accounts[2],
  });

  await delay(2000);
  expect(counter).toBe(2);
});
