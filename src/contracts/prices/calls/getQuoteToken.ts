import { IToken } from '@melonproject/token-math';

import { Environment } from '~/utils/environment';
import { Contract, getContract } from '~/utils/solidity';

export const getQuoteToken = async (
  contractAddress: string,
  environment?: Environment,
): Promise<IToken> => {
  const contract = await getContract(
    Contract.TestingPriceFeed,
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
