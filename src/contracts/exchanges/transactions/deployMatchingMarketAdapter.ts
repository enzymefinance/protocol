import Environment from '~/utils/environment/Environment';

import { default as deployContract } from '~/utils/solidity/deploy';

const deployMatchingMarketAdapter = async (environment?: Environment) => {
  const address = await deployContract(
    'exchanges/MatchingMarketAdapter.sol',
    null,
    environment,
  );

  return address;
};

export default deployMatchingMarketAdapter;
