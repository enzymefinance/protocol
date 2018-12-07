import { Environment } from '~/utils/environment/Environment';
import { deploy as deployContract } from '~/utils/solidity/deploy';

export const deployRegistry = async (environment: Environment) => {
  const address = await deployContract(environment, 'version/Registry', null);

  return address;
};
