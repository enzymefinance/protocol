import { initTestEnvironment } from '~/utils/environment';

import { deploySystem } from './deploySystem';

beforeAll(async () => await initTestEnvironment());

test(
  'Happy path',
  async () => {
    const deployment = await deploySystem();
    console.log(deployment);
  },
  30 * 1000,
);
