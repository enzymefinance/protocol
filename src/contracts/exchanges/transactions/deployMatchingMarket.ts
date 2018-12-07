import { Environment } from '~/utils/environment/Environment';

import { deploy as deployContract } from '~/utils/solidity/deploy';
import { Contracts } from '~/Contracts';

export const deployMatchingMarket = async (
  closeTime: number = 99999999999,
  environment?: Environment,
) => {
  const address = await deployContract(
    Contracts.MatchingMarket,
    [closeTime],
    environment,
  );

  return address;
};
