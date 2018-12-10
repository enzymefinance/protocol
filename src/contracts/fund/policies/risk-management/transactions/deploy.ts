import { Environment } from '~/utils/environment/Environment';
import { deploy as deployContract } from '~/utils/solidity/deploy';
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
