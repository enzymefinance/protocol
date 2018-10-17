import { initTestEnvironment } from '~/utils/environment';

import { deploy } from './deploy';

beforeAll(async () => {
  await initTestEnvironment();
});

test('deploy', async () => {
  const address = await deploy();
  expect(address).toBeTruthy();
});
