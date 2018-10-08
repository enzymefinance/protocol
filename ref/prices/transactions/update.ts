import { Price, price } from "@melonproject/token-math";

import ensureAccountAddress from "~/utils/environment/ensureAccountAddress";
import getGlobalEnvironment from "~/utils/environment/getGlobalEnvironment";
import { ensureAddress } from "~/utils/checks/isAddress";

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
  return transaction;
};

export const send = async (transaction, environment) => {
  const receipt = await transaction.send({
    from: environment.wallet.address
  });

  return receipt;
};

// TODO: Real postprocessing
export const postProcess = async (receipt, prices) => prices;

const update = async (
  contractAddress: string,
  prices: Price[],
  environment = getGlobalEnvironment()
): Promise<Price[]> => {
  await guards(contractAddress, prices, environment);
  const transaction = await prepare(contractAddress, prices, environment);
  const receipt = await send(transaction, environment);
  const result = postProcess(receipt, prices);
  return result;
};

export default update;
