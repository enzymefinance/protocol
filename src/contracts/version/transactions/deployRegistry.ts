import { Environment } from '~/utils/environment/Environment';
import { deployContract } from '~/utils/solidity/deployContract';
import { Contracts } from '~/Contracts';
import { Address } from '@melonproject/token-math';

export const deployRegistry = async (
  environment: Environment,
  postDeploymentOwner: Address,
) => {
  const address = await deployContract(environment, Contracts.Registry, [
    postDeploymentOwner.toString(),
  ]);

  return address;
};
