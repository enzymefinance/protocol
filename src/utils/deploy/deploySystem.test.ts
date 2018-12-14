import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { deploySystem } from './deploySystem';
import { deployThirdparty } from './deployThirdparty';

describe('deploySystem', () => {
  it('Happy path', async () => {
    const environment = await initTestEnvironment();
    const thirdpartyContracts = await deployThirdparty(environment);
    await deploySystem(environment, thirdpartyContracts);
  });
});
