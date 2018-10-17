import {
  initTestEnvironment,
  Environment,
  getGlobalEnvironment,
} from '~/utils/environment';

import { isAddress } from '../checks';
import { deploy } from './deploy';

beforeAll(async () => {
  await initTestEnvironment();
});

test('Happy path', async () => {
  const address = await deploy('dependencies/token/PreminedToken.sol', [
    'TEST',
    18,
    'Test Token',
  ]);

  expect(isAddress(address)).toBe(true);
});

test('Throwing error if gasLimit is below gasEstimation', async () => {
  const globalEnvironment = getGlobalEnvironment();
  const environment: Environment = {
    ...globalEnvironment,
    options: {
      gasLimit: '1000',
      gasPrice: globalEnvironment.options.gasPrice,
    },
  };
  await expect(
    deploy('exchanges/MatchingMarket.sol', [99999999999], environment),
  ).rejects.toThrow('gas limit:');
});
