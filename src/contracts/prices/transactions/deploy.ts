import { TokenInterface } from '@melonproject/token-math/token';
import { Environment } from '~/utils/environment/Environment';
import { deploy as deployContract } from '~/utils/solidity/deploy';
import { ensureAddress } from '~/utils/checks/isAddress';
import { Contracts } from '~/Contracts';

export const deploy = async (
  quoteToken: TokenInterface,
  environment?: Environment,
) => {
  ensureAddress(quoteToken.address);

  const address = await deployContract(
    Contracts.TestingPriceFeed,
    [quoteToken.address, quoteToken.decimals],
    environment,
  );

  return address;
};
