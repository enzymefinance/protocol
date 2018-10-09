import { IToken } from "@melonproject/token-math";

import getContract from "../utils/getContract";

const getQuoteToken = async (contractAddress: string): Promise<IToken> => {
  const contract = await getContract(contractAddress);
  const result = await contract.methods.QUOTE_ASSET().call();

  // TODO: Lookup symbol / decimals
  return {
    address: result,
    symbol: "ETH",
    decimals: 18
  };
};

export default getQuoteToken;
