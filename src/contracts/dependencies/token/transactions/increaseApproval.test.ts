import { createQuantity } from '@melonproject/token-math/quantity';

import { initTestEnvironment, getGlobalEnvironment } from '~/utils/environment';

import { Address } from '~/utils/types';

import { increaseApproval, deploy, getToken } from '..';

const shared: any = {};

beforeAll(async () => {
  await initTestEnvironment();
  shared.address = await deploy();
  shared.token = await getToken(shared.address);
});

test('increaseApproval', async () => {
  const environment = getGlobalEnvironment();
  const accounts = await environment.eth.getAccounts();
  const howMuch = createQuantity(shared.token, '1000000000000000000');

  const receipt = await increaseApproval({
    howMuch,
    spender: new Address(accounts[0]),
  });

  expect(receipt).toBeTruthy();
});
