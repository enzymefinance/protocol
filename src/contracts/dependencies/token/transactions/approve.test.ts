import { createQuantity } from '@melonproject/token-math/quantity';

import { initTestEnvironment, getGlobalEnvironment } from '~/utils/environment';
import { Address } from '~/utils/types';

import { deploy, getToken } from '..';
import { approve } from './approve';

const shared: any = {};

beforeAll(async () => {
  const environment = await initTestEnvironment();
  shared.address = await deploy();
  shared.token = await getToken(shared.address);
  shared.accounts = (await environment.eth.getAccounts()).map(
    a => new Address(a),
  );
});

test('approve', async () => {
  const environment = getGlobalEnvironment();
  const howMuch = createQuantity(shared.token, '1000000000000000000');

  const receipt = await approve({ howMuch, spender: shared.accounts[1] });

  expect(receipt).toBeTruthy();
});

test('insufficent balance', async () => {
  await expect(
    approve({
      howMuch: createQuantity(shared.token, '2000000000000000000000000'),
      spender: shared.accounts[1],
    }),
  ).rejects.toThrow('Insufficient');
});
