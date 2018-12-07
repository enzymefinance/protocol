import { Environment } from '~/utils/environment/Environment';
import { deploy as deployContract } from '~/utils/solidity/deploy';

export const deployMatchingMarketAdapter = async (environment: Environment) => {
  const address = await deployContract(
    environment,
    'exchanges/MatchingMarketAdapter.sol',
    null,
  );

  return address;
};
