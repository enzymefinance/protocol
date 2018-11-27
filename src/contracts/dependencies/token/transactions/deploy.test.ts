import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { deployToken } from './deploy';

beforeAll(async () => {
  await initTestEnvironment();
});

test('deploy', async () => {
  const address = await deployToken();
  expect(address).toBeTruthy();
});
