import { Environment } from '~/utils/environment';

import { deploy as deployContract } from '~/utils/solidity';

export const deployFeeManagerFactory = async (environment?: Environment) => {
  const address = await deployContract(
    'fund/fees/FeeManagerFactory.sol',
    null,
    environment,
  );

  return address;
};
