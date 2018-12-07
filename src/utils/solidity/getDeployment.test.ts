import { initTestEnvironment } from '~/utils/environment/initTestEnvironment';
import { getDeployment } from './getDeployment';
import { deploySystem } from '~/utils/deploySystem';

const shared: any = {};

beforeAll(async () => {
  shared.env = await initTestEnvironment();
});

test('Happy path', async () => {
  await deploySystem(shared.env);
  const deployment = await getDeployment(shared.env);

  expect(Object.keys(deployment)).toEqual(
    expect.arrayContaining([
      'exchangeConfigs',
      'policies',
      'priceSource',
      'tokens',
      'version',
    ]),
  );
});
