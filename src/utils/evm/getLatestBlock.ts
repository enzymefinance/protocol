import { getGlobalEnvironment } from '../environment';

const getLatestBlock = async (environment = getGlobalEnvironment()) => {
  return environment.eth.getBlock('latest');
};

export { getLatestBlock };
