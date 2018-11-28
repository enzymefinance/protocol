import { getGlobalEnvironment } from '../environment/globalEnvironment';

const getLatestBlock = async (environment = getGlobalEnvironment()) => {
  return environment.eth.getBlock('latest');
};

export { getLatestBlock };
