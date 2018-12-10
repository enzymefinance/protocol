import { Environment } from '~/utils/environment/Environment';

import { deploy as deployContract } from '~/utils/solidity/deploy';

export const deployMatchingMarket = async (
  environment: Environment,
  closeTime: number = 99999999999,
) => {
  const address = await deployContract(
    environment,
    'exchanges/thirdparty/oasisdex/MatchingMarket.sol',
    [closeTime],
  );

  return address;
};
