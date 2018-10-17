import { Environment } from '~/utils/environment/Environment';

import { deploy as deployContract } from '~/utils/solidity';

export const deployMatchingMarket = async (
  closeTime: number = 99999999999,
  environment?: Environment,
) => {
  const address = await deployContract(
    'exchanges/MatchingMarket.sol',
    [closeTime],
    environment,
  );

  return address;
};
