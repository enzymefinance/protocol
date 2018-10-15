import Environment from '~/utils/environment/Environment';

import { default as deployContract } from '~/utils/solidity/deploy';

const deploySharesFactory = async (environment?: Environment) => {
  const address = await deployContract(
    'fund/shares/SharesFactory.sol',
    null,
    environment,
  );

  return address;
};

export default deploySharesFactory;
