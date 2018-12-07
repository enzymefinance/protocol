import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { deploySystem } from './deploySystem';

const shared: any = {};

beforeAll(async () => {
  shared.env = await initTestEnvironment();
});

test('Happy path', async () => {
  await deploySystem(shared.env);
});
