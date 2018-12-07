import { createQuantity } from '@melonproject/token-math/quantity';
import { Address } from '@melonproject/token-math/address';
import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { constructEnvironment } from '~/utils/environment/constructEnvironment';
import { getToken } from '../calls/getToken';
import { transfer } from '../transactions/transfer';
import { deployToken } from '../transactions/deploy';

const shared: any = {};

beforeAll(async () => {
  shared.env = await initTestEnvironment();
  shared.address = await deployToken(shared.env);
  shared.token = await getToken(shared.env, shared.address);
  shared.accounts = (await shared.env.eth.getAccounts()).map(
    account => new Address(account),
  );
});

test('transfer', async () => {
  const howMuch = createQuantity(shared.token, '1000000000000000000');
  const receipt = await transfer(shared.env, {
    howMuch,
    to: shared.accounts[1],
  });

  expect(receipt).toBeTruthy();
});

test('transfer without account address', async () => {
  const emptyEnvironment = constructEnvironment({
    endpoint: process.env.JSON_RPC_ENDPOINT,
  });
  const howMuch = createQuantity(shared.token, '1000000000000000000');

  await expect(
    transfer(emptyEnvironment, {
      howMuch,
      to: shared.accounts[1],
    }),
  ).rejects.toThrow('No address');
});

test.only('insufficent balance', async () => {
  await expect(
    transfer(shared.env, {
      howMuch: createQuantity(shared.token, '2000000000000000000000000'),
      to: shared.accounts[1],
    }),
  ).rejects.toThrow('Insufficient');
});
