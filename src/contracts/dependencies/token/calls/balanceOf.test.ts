import { Quantity } from '@melonproject/token-math';

import initTestEnvironment from '~/utils/environment/initTestEnvironment';
import getGlobalEnvironment from '~/utils/environment/getGlobalEnvironment';

import deploy from '../transactions/deploy';
import balanceOf from './balanceOf';

const shared: any = {};

beforeAll(async () => {
  await initTestEnvironment();
  shared.address = await deploy();
});

test('balanceOf', async () => {
  const environment = getGlobalEnvironment();

  const balance = await balanceOf(shared.address, {
    address: environment.wallet.address,
  });

  const expected = Quantity.createQuantity(
    {
      symbol: 'FIXED',
      decimals: 18,
      address: shared.address,
    },
    '1000000000000000000000000',
  );

  expect(Quantity.isEqual(balance, expected)).toBe(true);
});
