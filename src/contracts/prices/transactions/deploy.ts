import { TokenInterface } from '@melonproject/token-math/token';

import { Environment } from '~/utils/environment';
import { deploy as deployContract } from '~/utils/solidity/deploy';
import { ensureAddress } from '~/utils/checks';

export const deploy = async (
  quoteToken: TokenInterface,
  environment?: Environment,
) => {
  ensureAddress(quoteToken.address);

  const address = await deployContract(
    'prices/TestingPriceFeed.sol',
    [quoteToken.address, quoteToken.decimals],
    environment,
  );

  return address;
};
