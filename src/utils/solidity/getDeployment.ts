import { getSessionDeployment } from '~/utils/sessionDeployments';
import { Environment } from '~/utils/environment/Environment';

const ensureDeployments = () => {
  try {
    return require('../../../out/deployments.json');
  } catch (e) {
    throw new Error(
      // tslint:disable-next-line:max-line-length
      `out/deplyoments.json not found. Did your run: Did you run 'yarn deploy'?`,
    );
  }
};

const doGetDeployment = (track: string, network: string) => {
  const deploymentId = `${network}:${track}`;
  const deployment =
    getSessionDeployment(deploymentId) || ensureDeployments()[deploymentId];

  if (!deployment) {
    throw new Error(
      // tslint:disable-next-line:max-line-length
      `No deployment found with id ${deploymentId}. (chainId:track)`,
    );
  }

  return deployment;
};

const getDeployment = async (environment: Environment) => {
  const track = environment.track;
  const network = await environment.eth.net.getId();
  return doGetDeployment(track, network);
};

const getDeploymentSync = (environment: Environment, network: string) => {
  const track = environment.track;
  return doGetDeployment(track, network);
};

export { getDeployment, getDeploymentSync };
