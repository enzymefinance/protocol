import { Environment } from '~/utils/environment/Environment';
import { deployContract } from '~/utils/solidity/deployContract';
import { Contracts } from '~/Contracts';

export const deploy = async (
  environment: Environment,
  tolerancePercent: number,
) => {
  const address = await deployContract(environment, Contracts.PriceTolerance, [
    tolerancePercent,
  ]);

  return address;
};
