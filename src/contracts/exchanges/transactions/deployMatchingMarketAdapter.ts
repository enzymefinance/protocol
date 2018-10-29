import { Environment } from '~/utils/environment';

import { deploy as deployContract } from '~/utils/solidity';

export const deployMatchingMarketAdapter = async (
  environment?: Environment,
) => {
  const address = await deployContract(
    'exchanges/thirdparty/oasisdex/MatchingMarketAdapter.sol',
    null,
    environment,
  );

  return address;
};
