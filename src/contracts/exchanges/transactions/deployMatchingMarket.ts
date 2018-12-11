import { Environment } from '~/utils/environment/Environment';

import { deployContract } from '~/utils/solidity/deployContract';
import { Contracts } from '~/Contracts';

export const deployMatchingMarket = async (
  environment: Environment,
  closeTime: number = 99999999999,
) => {
  const address = await deployContract(environment, Contracts.MatchingMarket, [
    closeTime,
  ]);

  return address;
};
