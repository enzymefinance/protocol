import { initTestEnvironment } from '~/utils/environment';

import { deploySystem } from './deploySystem';

beforeAll(async () => await initTestEnvironment());

test(
  'Happy path',
  async () => {
    await deploySystem();
  },
  30 * 1000,
);
