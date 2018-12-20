import { Address } from '@melonproject/token-math/address';
import {
  isEqual,
  PriceInterface,
  toAtomic,
} from '@melonproject/token-math/price';
import { ensureAccountAddress } from '~/utils/environment/ensureAccountAddress';
import { ensureAddress } from '~/utils/checks/isAddress';
import { ensure } from '~/utils/guards/ensure';
import { getPrices } from '../calls/getPrices';
import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';
import { Environment } from '~/utils/environment/Environment';

const guards = async (environment: Environment, contractAddress) => {
  ensureAddress(contractAddress);
  ensureAccountAddress(environment);

  // TODO: check if given price is against quote
};

const prepare = async (environment: Environment, contractAddress, prices) => {
  const contract = getContract(
    environment,
    Contracts.TestingPriceFeed,
    contractAddress,
  );

  const transaction = contract.methods.update(
    prices.map(p => p.base.token.address),
    prices.map(p => `${toAtomic(p)}`),
  );

  return transaction;
};

const send = async (environment: Environment, transaction) => {
  const receipt = await transaction.send({
    from: environment.wallet.address.toString(),
    gas: 8000000,
  });

  return receipt;
};

// TODO: Real postprocessing
const postProcess = async (
  environment: Environment,
  contractAddress,
  prices,
  preventCancelDown,
  receipt,
) => {
  const updatedPrices = await getPrices(
    environment,
    contractAddress,
    prices.map(p => p.base.token),
    preventCancelDown,
  );

  ensure(isEqual(updatedPrices[0], prices[0]), 'Price did not update', {
    is: JSON.stringify(updatedPrices[0]),
    should: JSON.stringify(prices[0]),
  });

  return updatedPrices;
};

export const update = async (
  environment: Environment,
  contractAddress: Address,
  prices: PriceInterface[],
  preventCancelDown: boolean = false,
): Promise<PriceInterface[]> => {
  await guards(environment, contractAddress);
  const transaction = await prepare(environment, contractAddress, prices);
  const receipt = await send(environment, transaction);
  const result = postProcess(
    environment,
    contractAddress,
    prices,
    preventCancelDown,
    receipt,
  );
  return result;
};
