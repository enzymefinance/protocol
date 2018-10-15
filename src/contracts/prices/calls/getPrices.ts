import * as R from "ramda";

import { IToken, Price, Quantity, Token } from "@melonproject/token-math";

import getContract from "../utils/getContract";
import getQuoteToken from "../calls/getQuoteToken";

const getPrice = Price.getPrice;

const getPrices = async (contractAddress: string, tokens: IToken[]) => {
  const quoteToken = await getQuoteToken(contractAddress);
  const contract = await getContract(contractAddress);

  const result = await contract.methods
    .getPrices(tokens.map(t => t.address))
    .call();

  const processResult = (price, timestamp) => ({
    price,
    timestamp
  });

  const processed = R.zipWith(processResult, result["0"], result["1"]);

  const createPrice = (t: IToken, { price, timestamp }) => {
    const base = Quantity.createQuantity(t, Token.appendDecimals(t, 1));
    const quote = Quantity.createQuantity(quoteToken, price);
    return getPrice(base, quote);
  };

  const prices = R.zipWith(createPrice, tokens, processed);
  return prices;
};

export default getPrices;
