import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { deploySystem } from './deploySystem';

test('Happy path', async () => {
  const environment = await initTestEnvironment();
  await deploySystem(environment);
});
