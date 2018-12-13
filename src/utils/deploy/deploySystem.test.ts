import { initTestEnvironment } from '~/tests/utils/initTestEnvironment';
import { deploySystem } from './deploySystem';
import { deployThirdParty } from './deployThirdParty';

describe('deploySystem', () => {
  it('Happy path', async () => {
    const environment = await initTestEnvironment();
    const thirdPartyContracts = await deployThirdParty(environment);
    await deploySystem(environment, thirdPartyContracts);
  });
});
