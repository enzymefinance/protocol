import { deployContract } from '~/utils/solidity/deployContract';
import { Contracts } from '~/Contracts';
import { Environment } from '~/utils/environment/Environment';

export const deployWeth = async (environment: Environment) => {
  const address = await deployContract(environment, Contracts.Weth);

  return address;
};
