import { initTestEnvironment } from '../environment';
import { getDeployment } from './getDeployment';

beforeAll(async () => {
  await initTestEnvironment();
});

test('Happy path', async () => {
  const deployment = await getDeployment();
});
