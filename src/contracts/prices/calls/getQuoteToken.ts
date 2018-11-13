import { TokenInterface } from '@melonproject/token-math/token';

import { Environment } from '~/utils/environment';
import { getContract } from '~/utils/solidity';
import { Contracts } from '~/Contracts';

export const getQuoteToken = async (
  contractAddress: string,
  environment?: Environment,
): Promise<TokenInterface> => {
  const contract = await getContract(
    Contracts.TestingPriceFeed,
    contractAddress,
    environment,
  );
  const result = await contract.methods.QUOTE_ASSET().call();

  // TODO: Lookup symbol / decimals
  return {
    address: result,
    decimals: 18,
    symbol: 'ETH',
  };
};
