import { initTestEnvironment } from '~/utils/environment';

import { getInfo, deployToken } from '..';

const shared: any = {};

beforeAll(async () => {
  await initTestEnvironment();
  shared.address = await deployToken();
});

test('getInfo', async () => {
  const info = await getInfo(shared.address);

  expect(info.symbol).toBe('FIXED');
  expect(info.name).toBe('Premined Token');
  expect(info.decimals).toBe(18);
  expect(info.totalSupply).toBe(1000000 * 10 ** 18);
});
