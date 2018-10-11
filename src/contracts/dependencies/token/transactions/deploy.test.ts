import initTestEnvironment from '~/utils/environment/initTestEnvironment';

import deploy from './deploy';

const shared: any = {};

beforeAll(async () => {
  await initTestEnvironment();
});

test('deploy', async () => {
  const address = await deploy();
  expect(address).toBeTruthy();
});
