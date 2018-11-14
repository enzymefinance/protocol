import { initTestEnvironment } from '../environment';
import { getDeployment } from './getDeployment';

beforeAll(async () => {
  await initTestEnvironment();
});

test('Happy path', async () => {
  await getDeployment();
});
