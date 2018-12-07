import * as R from 'ramda';
import { getPrice, PriceInterface } from '@melonproject/token-math/price';
import { appendDecimals, TokenInterface } from '@melonproject/token-math/token';
import { createQuantity } from '@melonproject/token-math/quantity';
import { Environment } from '~/utils/environment/Environment';
import { getQuoteToken } from '../calls/getQuoteToken';
import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';

export const getPrices = async (
  environment: Environment,
  contractAddress: string,
  tokens: TokenInterface[],
  preventCancelDown: boolean = false,
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

  const createPrice = (t: TokenInterface, { price, timestamp }) => {
    const base = createQuantity(t, appendDecimals(t, 1));
    const quote = createQuantity(quoteToken, price);
    return getPrice(base, quote, preventCancelDown);
  };

  const prices = R.zipWith(createPrice, tokens, processed);
  return prices;
};
