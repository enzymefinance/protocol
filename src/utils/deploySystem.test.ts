import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { deploySystem } from './deploySystem';

describe('deploySystem', () => {
  it('Happy path', async () => {
    const environment = await initTestEnvironment();
    await deploySystem(environment);
  });
});
