import { TokenInterface } from '@melonproject/token-math/token';
import { Environment } from '~/utils/environment/Environment';
import { deploy as deployContract } from '~/utils/solidity/deploy';
import { ensureAddress } from '~/utils/checks/isAddress';
import { Contracts } from '~/Contracts';

export const deployTestingPriceFeed = async (
  environment: Environment,
  quoteToken: TokenInterface,
) => {
  ensureAddress(quoteToken.address);

  const address = await deployContract(
    environment,
    Contracts.TestingPriceFeed,
    [quoteToken.address, quoteToken.decimals],
  );

  return address;
};
