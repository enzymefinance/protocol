import { Environment } from '../environment/Environment';
import { Block } from 'ethers/providers';

const getLatestBlock = async (environment: Environment): Promise<Block> => {
  return environment.eth.getBlock('latest');
};

export { getLatestBlock };
