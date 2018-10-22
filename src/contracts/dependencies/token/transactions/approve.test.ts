import { createQuantity } from '@melonproject/token-math/quantity';

import { initTestEnvironment, getGlobalEnvironment } from '~/utils/environment';
import { Address } from '~/utils/types';

import { deploy, getToken } from '..';
import { approve } from './approve';

const shared: any = {};

beforeAll(async () => {
  await initTestEnvironment();
  shared.address = await deploy();
  shared.token = await getToken(shared.address);
});

test('transfer', async () => {
  const environment = getGlobalEnvironment();
  const accounts = await environment.eth.getAccounts();
  const howMuch = createQuantity(shared.token, '1000000000000000000');

  const receipt = await approve({ howMuch, spender: new Address(accounts[1]) });

  expect(receipt).toBeTruthy();
});
