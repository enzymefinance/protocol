import { Environment } from '~/utils/environment/Environment';
import { initTestEnvironment } from './initTestEnvironment';
import { deployThirdParty } from '~/utils/deploy/deployThirdParty';
import { deploySystem } from '~/utils/deploy/deploySystem';

const deployAndInitTestEnv = async (): Promise<Environment> => {
  const environment = await initTestEnvironment();
  const testthirdParty = await deployThirdParty(environment);
  const withDeployment = await deploySystem(environment, testthirdParty);
  return withDeployment;
};

export { deployAndInitTestEnv };
