import { createQuantity } from '@melonproject/token-math/quantity';
import { getGlobalEnvironment } from '~/utils/environment/globalEnvironment';
import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { Address } from '~/utils/types';
import { increaseApproval } from '../transactions/increaseApproval';
import { deployToken } from '../transactions/deploy';
import { getToken } from '../calls/getToken';

const shared: any = {};

beforeAll(async () => {
  await initTestEnvironment();
  shared.address = await deployToken();
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
