import { Environment, Deployment, WithDeployment } from './Environment';
import { getChainName } from '~/utils/environment/chainName';

const withDeployment = async (
  environment: Environment,
): Promise<WithDeployment> => {
  const deploymentId = `${await getChainName(environment)}-${
    environment.track
  }`;

  // tslint:disable-next-line:max-line-length
  const deployment: Deployment = require(`../../../deployments/${deploymentId}.json`);

  return {
    ...environment,
    deployment,
  };
};

export { withDeployment };
