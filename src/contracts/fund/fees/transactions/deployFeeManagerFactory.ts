import { Environment } from '~/utils/environment/Environment';
import { deploy as deployContract } from '~/utils/solidity/deploy';

export const deployFeeManagerFactory = async (environment: Environment) => {
  const address = await deployContract(
    environment,
    'fund/fees/FeeManagerFactory.sol',
    null,
  );

  return address;
};
