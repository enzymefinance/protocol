import { Environment } from '~/utils/environment/Environment';
import { deployContract } from '~/utils/solidity/deployContract';
import { Contracts } from '~/Contracts';

interface DeployEngineArgs {
  delay: number;
}

export const deployEngine = async (
  environment: Environment,
  { delay }: DeployEngineArgs,
) => {
  const address = await deployContract(environment, Contracts.Engine, [delay]);

  return address;
};
