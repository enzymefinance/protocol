import { createQuantity, isEqual } from '@melonproject/token-math/quantity';

import { initTestEnvironment, getGlobalEnvironment } from '~/utils/environment';

import { deploy, balanceOf } from '..';

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

  const expected = createQuantity(
    {
      address: shared.address,
      decimals: 18,
      symbol: 'FIXED',
    },
    '1000000000000000000000000',
  );

  expect(isEqual(balance, expected)).toBe(true);
});
