import { createQuantity } from '@melonproject/token-math/quantity';

import {
  initTestEnvironment,
  getGlobalEnvironment,
  constructEnvironment,
} from '~/utils/environment';

import { Address } from '~/utils/types';

import { transfer, deploy, getToken } from '..';

const shared: any = {};

beforeAll(async () => {
  await initTestEnvironment();
  const environment = getGlobalEnvironment();

  shared.address = await deploy();
  shared.token = await getToken(shared.address);
  shared.accounts = (await environment.eth.getAccounts()).map(
    account => new Address(account),
  );
});

test('transfer', async () => {
  const howMuch = createQuantity(shared.token, '1000000000000000000');
  const receipt = await transfer({ howMuch, to: shared.accounts[1] });

  expect(receipt).toBeTruthy();
});

test('transfer without account address', async () => {
  const emptyEnvironment = constructEnvironment({});
  const howMuch = createQuantity(shared.token, '1000000000000000000');

  await expect(
    transfer(
      {
        howMuch,
        to: shared.accounts[1],
      },
      emptyEnvironment,
    ),
  ).rejects.toThrow('No address');
});

// // TODO: Make this test work
// test.skip('insufficent balance', async () => {
// await expect(
// transfer(shared.address, {
// to: '0x1fEE0Ee72120B6A34C0FCdC93051Eb699a0D378B',
// tokens: '2000000000000000000000000',
// }),
// ).rejects.toThrow('balance');
// });
