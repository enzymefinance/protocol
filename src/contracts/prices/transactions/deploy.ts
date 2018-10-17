import { IToken } from '@melonproject/token-math';

import { Environment } from '~/utils/environment';
import { deploy as deployContract } from '~/utils/solidity';
import { ensureAddress } from '~/utils/checks';

export const deploy = async (quoteToken: IToken, environment?: Environment) => {
  ensureAddress(quoteToken.address);

  const address = await deployContract(
    'prices/TestingPriceFeed.sol',
    [quoteToken.address, quoteToken.decimals],
    environment,
  );

  return address;
};
