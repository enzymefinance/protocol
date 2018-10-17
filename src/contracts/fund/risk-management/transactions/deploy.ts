import { Environment } from '~/utils/environment';

import { deploy as deployContract } from '~/utils/solidity';

export const deploy = async (
  tolerancePercent: number,
  environment?: Environment,
) => {
  const address = await deployContract(
    'fund/risk-management/PriceTolerance.sol',
    [tolerancePercent],
    environment,
  );

  return address;
};
