import initTestEnvironment from '~/utils/environment/initTestEnvironment';

import deploySystem from './deploySystem';

const shared: any = {};

beforeAll(async () => {
  await initTestEnvironment();
});

test('deploySystem', async () => {
  deploySystem();
});
