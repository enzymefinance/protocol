import { IToken } from "@melonproject/token-math";

import { default as deployContract } from "~/utils/solidity/deploy";
import { ensureAddress } from "~/utils/checks/isAddress";

const deploy = async (quoteToken: IToken) => {
  ensureAddress(quoteToken.address);

  const address = await deployContract("./ref/prices/TestingPriceFeed.sol", [
    quoteToken.address,
    quoteToken.decimals
  ]);

  return address;
};

export default deploy;
