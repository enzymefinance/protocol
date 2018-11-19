import { initTestEnvironment } from '../environment';
import { getDeployment } from './getDeployment';
import { deploySystem } from '../deploySystem';

beforeAll(async () => {
  await initTestEnvironment();
});

test('Happy path', async () => {
  await deploySystem();
  const deployment = await getDeployment();

  expect(Object.keys(deployment)).toEqual(
    expect.arrayContaining([
      'exchangeConfigs',
      'fundFactory',
      'policies',
      'priceSource',
      'tokens',
      'version',
    ]),
  );
});
