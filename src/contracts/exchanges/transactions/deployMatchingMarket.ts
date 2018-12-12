import { TokenInterface } from '@melonproject/token-math/token';

import { Environment } from '~/utils/environment/Environment';
import { deployContract } from '~/utils/solidity/deployContract';
import { Contracts } from '~/Contracts';
import { addTokenPairWhitelist } from './addTokenPairWhitelist';

export interface DeployMatchingMarketArgs {
  tokens: TokenInterface[];
  closeTime?: number;
}

export const deployMatchingMarket = async (
  environment: Environment,
  { tokens, closeTime = 99999999999 }: DeployMatchingMarketArgs,
) => {
  const address = await deployContract(environment, Contracts.MatchingMarket, [
    closeTime,
  ]);

  const [quoteToken, ...rest] = tokens;

  for (const baseToken of rest) {
    await addTokenPairWhitelist(environment, address, {
      baseToken,
      quoteToken,
    });
  }

  return address;
};
