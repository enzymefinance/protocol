import { Environment } from '~/utils/environment/Environment';
import { deploy as deployContract } from '~/utils/solidity/deploy';
import { Contracts } from '~/Contracts';

export const deployFeeManagerFactory = async (environment?: Environment) => {
  const address = await deployContract(
    Contracts.FeeManagerFactory,
    null,
    environment,
  );

  return address;
};
