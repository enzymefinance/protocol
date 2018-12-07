import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { deployToken } from './deploy';

const shared: any = {};

beforeAll(async () => {
  shared.env = await initTestEnvironment();
});

test('deploy', async () => {
  const address = await deployToken(shared.env);
  expect(address).toBeTruthy();
});
