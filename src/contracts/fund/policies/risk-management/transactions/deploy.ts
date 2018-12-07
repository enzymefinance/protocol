import { Environment } from '~/utils/environment/Environment';
import { deploy as deployContract } from '~/utils/solidity/deploy';

export const deploy = async (
  environment: Environment,
  tolerancePercent: number,
) => {
  const address = await deployContract(
    environment,
    'fund/policies/risk-management/PriceTolerance.sol',
    [tolerancePercent],
  );

  return address;
};
