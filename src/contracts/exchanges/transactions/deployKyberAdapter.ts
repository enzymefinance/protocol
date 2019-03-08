import { deployContract } from '~/utils/solidity/deployContract';
import { Environment } from '~/utils/environment/Environment';
import { Contracts } from '~/Contracts';

export const deployKyberAdapter = async (environment: Environment) => {
  const address = await deployContract(environment, Contracts.KyberAdapter);

  return address;
};
