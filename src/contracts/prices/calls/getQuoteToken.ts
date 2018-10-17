import { IToken } from '@melonproject/token-math';

import { Environment } from '~/utils/environment';
import { getContract } from '..';

export const getQuoteToken = async (
  contractAddress: string,
  environment?: Environment,
): Promise<IToken> => {
  const contract = await getContract(contractAddress, environment);
  const result = await contract.methods.QUOTE_ASSET().call();

  // TODO: Lookup symbol / decimals
  return {
    address: result,
    decimals: 18,
    symbol: 'ETH',
  };
};
