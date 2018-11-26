import { Environment } from '~/utils/environment';

import { deploy as deployContract } from '~/utils/solidity/deploy';

export const deploySharesFactory = async (environment?: Environment) => {
  const address = await deployContract(
    'fund/shares/SharesFactory.sol',
    null,
    environment,
  );

  return address;
};
