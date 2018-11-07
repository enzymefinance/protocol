import { getGlobalEnvironment } from '../environment';

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

const doGetDeployment = (deployments, track, network) => {
  const deploymentId = `${network}:${track}`;
  const deployment = deployments[deploymentId];

  if (!deployment) {
    throw new Error(
      // tslint:disable-next-line:max-line-length
      `No deployment found with id ${deploymentId}. (chainId:track). Did you run 'yarn deploy'?`,
    );
  }

  return deployment;
};

const getDeployment = async (environment = getGlobalEnvironment()) => {
  const deployments = ensureDeployments();
  const track = environment.track;
  const network = await environment.eth.net.getId();
  return doGetDeployment(deployments, track, network);
};

const getDeploymentSync = (network, environment = getGlobalEnvironment()) => {
  const deployments = ensureDeployments();
  const track = environment.track;
  return doGetDeployment(deployments, track, network);
};

export { getDeployment, getDeploymentSync };
