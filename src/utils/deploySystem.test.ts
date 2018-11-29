import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { deploySystem } from './deploySystem';

beforeAll(async () => await initTestEnvironment());

test('Happy path', async () => {
  await deploySystem();
});
