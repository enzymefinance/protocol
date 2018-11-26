import { Environment } from '~/utils/environment';

import { deploy as deployContract } from '~/utils/solidity/deploy';

export const deployPolicyManagerFactory = async (environment?: Environment) => {
  const address = await deployContract(
    'fund/policies/PolicyManagerFactory.sol',
    null,
    environment,
  );

  return address;
};
