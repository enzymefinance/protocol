import { Environment } from '~/utils/environment';

import { deploy as deployContract } from '~/utils/solidity/deploy';

export const deployMatchingMarketAdapter = async (
  environment?: Environment,
) => {
  const address = await deployContract(
    'exchanges/MatchingMarketAdapter.sol',
    null,
    environment,
  );

  return address;
};
