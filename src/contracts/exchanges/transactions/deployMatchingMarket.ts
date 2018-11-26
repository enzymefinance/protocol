import { Environment } from '~/utils/environment/Environment';

import { deploy as deployContract } from '~/utils/solidity/deploy';

export const deployMatchingMarket = async (
  closeTime: number = 99999999999,
  environment?: Environment,
) => {
  const address = await deployContract(
    'exchanges/thirdparty/oasisdex/MatchingMarket.sol',
    [closeTime],
    environment,
  );

  return address;
};
