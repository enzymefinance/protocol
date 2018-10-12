import Environment from '~/utils/environment/Environment';

import { default as deployContract } from '~/utils/solidity/deploy';

const deployFeeManagerFactory = async (environment?: Environment) => {
  const address = await deployContract(
    'fund/fees/FeeManagerFactory.sol',
    null,
    environment,
  );

  return address;
};

export default deployFeeManagerFactory;
