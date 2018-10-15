import { IToken } from '@melonproject/token-math';

import Environment from '~/utils/environment/Environment';
import { default as deployContract } from '~/utils/solidity/deploy';
import { ensureAddress } from '~/utils/checks/isAddress';

const deploy = async (quoteToken: IToken, environment?: Environment) => {
  ensureAddress(quoteToken.address);

  const address = await deployContract(
    'prices/TestingPriceFeed.sol',
    [quoteToken.address, quoteToken.decimals],
    environment,
  );

  return address;
};

export default deploy;
