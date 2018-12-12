import { deployContract } from './deployContract';
import { getContract } from './getContract';
import { Contracts } from '~/Contracts';
import { Environment } from '~/utils/environment/Environment';

export const deployAndGetContract = async (
  environment: Environment,
  contract: Contracts,
  args: any = [],
) => {
  const deployedContract = await deployContract(environment, contract, args);
  return getContract(environment, contract, deployedContract);
};
