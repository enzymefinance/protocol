import { TokenInterface } from '@melonproject/token-math/token';
import { Environment } from '~/utils/environment/Environment';
import { deploy as deployContract } from '~/utils/solidity/deploy';
import { ensureAddress } from '~/utils/checks/isAddress';

export const deploy = async (
  environment: Environment,
  quoteToken: TokenInterface,
) => {
  ensureAddress(quoteToken.address);

  const address = await deployContract(
    environment,
    'prices/TestingPriceFeed.sol',
    [quoteToken.address, quoteToken.decimals],
  );

  return address;
};
