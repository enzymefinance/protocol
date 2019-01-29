import { Environment } from '~/utils/environment/Environment';
import { deployContract } from '~/utils/solidity/deployContract';
import { Contracts } from '~/Contracts';
import { Address } from '@melonproject/token-math';

interface DeployEngineArgs {
  delay: number;
  postDeployOwner: Address;
}

export const deployEngine = async (
  environment: Environment,
  { delay, postDeployOwner }: DeployEngineArgs,
) => {
  const address = await deployContract(environment, Contracts.Engine, [
    delay,
    postDeployOwner.toString(),
  ]);

  return address;
};
