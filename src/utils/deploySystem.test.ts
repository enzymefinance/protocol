import initTestEnvironment from '~/utils/environment/initTestEnvironment';

import deploySystem from './deploySystem';

beforeAll(async () => initTestEnvironment());

test('Happy path', async () => {
  await deploySystem();
});
