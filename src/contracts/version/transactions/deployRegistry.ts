import { Environment } from '~/utils/environment/Environment';
import { deploy as deployContract } from '~/utils/solidity/deploy';

export const deployRegistry = async (environment?: Environment) => {
  const address = await deployContract('version/Registry', null, environment);

  return address;
};
