import { deploy as deployContract } from './deploy';
import { getContract } from './getContract';
import { Contracts } from '~/Contracts';
import { Environment } from '~/utils/environment/Environment';

export const deployAndGetContract = async (
  environment: Environment,
  contract: Contracts,
  args: any = [],
) => {
  const deployedContract = await deployContract(
    environment,
    `${contract}.sol`,
    args,
  );

  return getContract(environment, contract, deployedContract);
};
