import { Environment } from '~/utils/environment/Environment';
import { deploy as deployContract } from '~/utils/solidity/deploy';

export const deployPolicyManagerFactory = async (environment: Environment) => {
  const address = await deployContract(
    environment,
    'fund/policies/PolicyManagerFactory.sol',
    null,
  );

  return address;
};
