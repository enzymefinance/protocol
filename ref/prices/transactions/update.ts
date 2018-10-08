import { Price, price } from "@melonproject/token-math";

import ensureAccountAddress from "~/utils/environment/ensureAccountAddress";
import getGlobalEnvironment from "~/utils/environment/getGlobalEnvironment";
import { ensureAddress } from "~/utils/checks/isAddress";
import ensure from "~/utils/guards/ensure";

import getPrices from "../calls/getPrices";
import getContract from "../utils/getContract";

const guards = async (contractAddress, prices, environment) => {
  ensureAddress(contractAddress);
  ensureAccountAddress(environment);

  // TODO: check if given price is against quote
};

const prepare = async (contractAddress, prices, environment) => {
  const contract = getContract(contractAddress, environment);
  const transaction = contract.methods.update(
    prices.map(p => p.base.address),
    prices.map(price.toAtomic)
  );
  console.log(prices, prices.map(price.toAtomic));
  return transaction;
};

export const send = async (transaction, environment) => {
  const receipt = await transaction.send({
    from: environment.wallet.address
  });

  return receipt;
};

// TODO: Real postprocessing
export const postProcess = async (contractAddress, prices, receipt) => {
  const updatedPrices = await getPrices(
    contractAddress,
    prices.map(p => p.base)
  );
  ensure(price.isEqual(updatedPrices[0], prices[0]), "Price did not update", { should: prices[0], is: updatedPrices[0] });
  return updatedPrices;
};

const update = async (
  contractAddress: string,
  prices: Price[],
  environment = getGlobalEnvironment()
): Promise<Price[]> => {
  await guards(contractAddress, prices, environment);
  const transaction = await prepare(contractAddress, prices, environment);
  const receipt = await send(transaction, environment);
  const result = postProcess(contractAddress, prices, receipt);
  return result;
};

export default update;
