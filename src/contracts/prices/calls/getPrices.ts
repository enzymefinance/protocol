import * as R from "ramda";

import { Token, price, quantity, token } from "@melonproject/token-math";

import getContract from "../utils/getContract";
import getQuoteToken from "../calls/getQuoteToken";

const getPrice = price.getPrice;

const getPrices = async (contractAddress: string, tokens: Token[]) => {
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

  console.log(processed);

  const createPrice = (t: Token, { price, timestamp }) => {
    const base = quantity.createQuantity(t, token.appendDecimals(t, 1));
    const quote = quantity.createQuantity(quoteToken, price);
    return getPrice(base, quote);
  };

  const prices = R.zipWith(createPrice, tokens, processed);
  return prices;
};

export default getPrices;
