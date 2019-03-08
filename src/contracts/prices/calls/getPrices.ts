import * as R from 'ramda';
import {
  Address,
  createQuantity,
  createPrice,
  PriceInterface,
  appendDecimals,
  TokenInterface,
} from '@melonproject/token-math';

import { Environment } from '~/utils/environment/Environment';
import { getQuoteToken } from '../calls/getQuoteToken';
import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';

export const getPrices = async (
  environment: Environment,
  contractAddress: Address,
  tokens: TokenInterface[],
): Promise<PriceInterface[]> => {
  const quoteToken = await getQuoteToken(environment, contractAddress);
  const contract = await getContract(
    environment,
    Contracts.TestingPriceFeed,
    contractAddress,
  );

  const result = await contract.methods
    .getPrices(tokens.map(t => t.address))
    .call();

  const processResult = (price, timestamp) => ({
    price,
    timestamp,
  });

  const processed = R.zipWith(processResult, result['0'], result['1']);

  const makePrice = (t: TokenInterface, { price, timestamp }) => {
    const base = createQuantity(t, appendDecimals(t, 1));
    const quote = createQuantity(quoteToken, price);
    return createPrice(base, quote);
  };

  const prices = R.zipWith(makePrice, tokens, processed);
  return prices;
};
