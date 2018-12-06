import {
  getPrice as getPriceTokenMath,
  PriceInterface,
} from '@melonproject/token-math/price';
import { appendDecimals, TokenInterface } from '@melonproject/token-math/token';
import { createQuantity } from '@melonproject/token-math/quantity';
import { Environment } from '~/utils/environment/Environment';
import { getQuoteToken } from '../calls/getQuoteToken';
import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';

export const getPrice = async (
  contractAddress: string,
  token: TokenInterface,
  preventCancelDown: boolean = false,
  environment?: Environment,
): Promise<PriceInterface> => {
  const quoteToken = await getQuoteToken(contractAddress, environment);
  const contract = await getContract(
    Contracts.TestingPriceFeed,
    contractAddress,
    environment,
  );

  const { 0: price } = await contract.methods.getPrice(token.address).call();

  const base = createQuantity(token, appendDecimals(token, 1));
  const quote = createQuantity(quoteToken, price);
  return getPriceTokenMath(base, quote, preventCancelDown);
};
