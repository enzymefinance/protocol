import { createQuantity } from '@melonproject/token-math/quantity';
import { Address } from '@melonproject/token-math/address';
import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { increaseApproval } from '../transactions/increaseApproval';
import { deployToken } from '../transactions/deploy';
import { getToken } from '../calls/getToken';

const shared: any = {};

beforeAll(async () => {
  shared.env = await initTestEnvironment();
  shared.address = await deployToken(shared.env);
  shared.token = await getToken(shared.env, shared.address);
});

test('increaseApproval', async () => {
  const accounts = await shared.env.eth.getAccounts();
  const howMuch = createQuantity(shared.token, '1000000000000000000');

  const receipt = await increaseApproval(shared.env, {
    howMuch,
    spender: new Address(accounts[0]),
  });

  expect(receipt).toBeTruthy();
});
