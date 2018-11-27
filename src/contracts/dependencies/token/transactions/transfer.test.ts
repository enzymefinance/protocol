import { createQuantity } from '@melonproject/token-math/quantity';
import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { constructEnvironment } from '~/utils/environment/constructEnvironment';
import { getGlobalEnvironment } from '~/utils/environment/globalEnvironment';
import { Address } from '~/utils/types';
import { getToken } from '../calls/getToken';
import { transfer } from '../transactions/transfer';
import { deployToken } from '../transactions/deploy';

const shared: any = {};

beforeAll(async () => {
  await initTestEnvironment();
  const environment = getGlobalEnvironment();

  shared.address = await deployToken();
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
  const emptyEnvironment = constructEnvironment({
    endpoint: process.env.JSON_RPC_ENDPOINT,
  });
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

test.only('insufficent balance', async () => {
  await expect(
    transfer({
      howMuch: createQuantity(shared.token, '2000000000000000000000000'),
      to: shared.accounts[1],
    }),
  ).rejects.toThrow('Insufficient');
});
