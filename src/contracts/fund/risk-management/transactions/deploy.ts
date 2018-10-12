import Environment from '~/utils/environment/Environment';

import { default as deployContract } from '~/utils/solidity/deploy';

const deploy = async (tolerancePercent: number, environment?: Environment) => {
  const address = await deployContract(
    'fund/risk-management/PriceTolerance.sol',
    [tolerancePercent],
    environment,
  );

  return address;
};

export default deploy;
