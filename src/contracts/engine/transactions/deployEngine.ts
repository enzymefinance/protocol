import { Environment } from '~/utils/environment/Environment';
import { deployContract } from '~/utils/solidity/deployContract';
import { Contracts } from '~/Contracts';
import { Address } from '@melonproject/token-math';

interface DeployEngineArgs {
  delay: number;
  registry: Address;
}

export const deployEngine = async (
  environment: Environment,
  { delay, registry }: DeployEngineArgs,
) => {
  const address = await deployContract(environment, Contracts.Engine, [
    delay,
    registry.toString(),
  ]);

  return address;
};
