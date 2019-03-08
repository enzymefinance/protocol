import { Environment } from '~/utils/environment/Environment';
import { deployContract } from '~/utils/solidity/deployContract';
import { Contracts } from '~/Contracts';

export const deployPolicyManagerFactory = async (environment: Environment) => {
  const address = await deployContract(
    environment,
    Contracts.PolicyManagerFactory,
  );

  return address;
};
