import { Environment } from '~/utils/environment/Environment';
import { initTestEnvironment } from './initTestEnvironment';
import { deployThirdParty } from '~/utils/deploy/deployThirdParty';
import {
  deploySystem,
  deployAllContractsConfig,
  defaultControlConfig,
} from '~/utils/deploy/deploySystem';

const deployAndInitTestEnv = async (): Promise<Environment> => {
  const environment = await initTestEnvironment();
  const testThirdParty = await deployThirdParty(environment);
  const withDeployment = await deploySystem(
    environment,
    testThirdParty,
    deployAllContractsConfig,
    defaultControlConfig,
  );
  return withDeployment;
};

export { deployAndInitTestEnv };
