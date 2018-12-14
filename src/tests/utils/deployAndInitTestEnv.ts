import { Environment } from '~/utils/environment/Environment';
import { initTestEnvironment } from './initTestEnvironment';
import { deployThirdparty } from '~/utils/deploy/deployThirdparty';
import { deploySystem } from '~/utils/deploy/deploySystem';

const deployAndInitTestEnv = async (): Promise<Environment> => {
  const environment = await initTestEnvironment();
  const testThirdparty = await deployThirdparty(environment);
  const withDeployment = await deploySystem(environment, testThirdparty);
  return withDeployment;
};

export { deployAndInitTestEnv };
