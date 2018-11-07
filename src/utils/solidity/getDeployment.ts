import { getGlobalEnvironment } from '../environment';

const getDeployment = async (environment = getGlobalEnvironment()) => {
  let deployments = {};
  try {
    deployments = require('../../../out/deployments.json');
  } catch (e) {
    throw new Error(
      // tslint:disable-next-line:max-line-length
      `out/deplyoments.json not found. Did your run: Did you run 'yarn deploy'?`,
    );
  }

  const networkId = await environment.eth.net.getId();
  const deploymentId = `${networkId}:${environment.track}`;
  const deployment = deployments[deploymentId];

  if (!deployment) {
    throw new Error(
      // tslint:disable-next-line:max-line-length
      `No deployment found with id ${deploymentId}. (chainId:track). Did you run 'yarn deploy'?`,
    );
  }
  return deployment;
};

export { getDeployment };
