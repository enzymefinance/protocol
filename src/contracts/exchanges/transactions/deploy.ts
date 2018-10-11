import Environment from '~/utils/environment/Environment';

import { default as deployContract } from '~/utils/solidity/deploy';

const deploy = async (
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

export default deploy;
