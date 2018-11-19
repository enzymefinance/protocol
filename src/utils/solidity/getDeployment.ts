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

const doGetDeployment = (track, network) => {
  const deploymentId = `${network}:${track}`;

  const { sessionDeployments } = require('../deploySystem');

  const deployment =
    sessionDeployments[deploymentId] || ensureDeployments()[deploymentId];

  if (!deployment) {
    throw new Error(
      // tslint:disable-next-line:max-line-length
      `No deployment found with id ${deploymentId}. (chainId:track)`,
    );
  }

  return deployment;
};

const getDeployment = async (environment = getGlobalEnvironment()) => {
  const track = environment.track;
  const network = await environment.eth.net.getId();
  return doGetDeployment(track, network);
};

const getDeploymentSync = (network, environment = getGlobalEnvironment()) => {
  const track = environment.track;
  return doGetDeployment(track, network);
};

export { getDeployment, getDeploymentSync };
