import { TokenInterface } from '@melonproject/token-math';
import { Environment } from '~/utils/environment/Environment';
import { deployContract } from '~/utils/solidity/deployContract';
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
