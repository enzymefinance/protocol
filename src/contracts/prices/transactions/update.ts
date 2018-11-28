import { Address } from '@melonproject/token-math/address';
import {
  isEqual,
  PriceInterface,
  toAtomic,
} from '@melonproject/token-math/price';
import { ensureAccountAddress } from '~/utils/environment/ensureAccountAddress';
import { getGlobalEnvironment } from '~/utils/environment/globalEnvironment';
import { ensureAddress } from '~/utils/checks/isAddress';
import { ensure } from '~/utils/guards/ensure';
import { getPrices } from '../calls/getPrices';
import { getContract } from '~/utils/solidity/getContract';
import { Contracts } from '~/Contracts';

const guards = async (contractAddress, prices, environment) => {
  ensureAddress(contractAddress);
  ensureAccountAddress(environment);

  // TODO: check if given price is against quote
};

const prepare = async (contractAddress, prices, environment) => {
  const contract = getContract(
    Contracts.TestingPriceFeed,
    contractAddress,
    environment,
  );

  const transaction = contract.methods.update(
    prices.map(p => p.base.token.address),
    prices.map(p => `${toAtomic(p)}`),
  );

  return transaction;
};

const send = async (transaction, environment) => {
  const receipt = await transaction.send({
    from: environment.wallet.address.toString(),
  });

  return receipt;
};

// TODO: Real postprocessing
const postProcess = async (
  contractAddress,
  prices,
  preventCancelDown,
  receipt,
) => {
  const updatedPrices = await getPrices(
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
  contractAddress: Address,
  prices: PriceInterface[],
  preventCancelDown: boolean = false,
  environment = getGlobalEnvironment(),
): Promise<PriceInterface[]> => {
  await guards(contractAddress, prices, environment);
  const transaction = await prepare(contractAddress, prices, environment);
  const receipt = await send(transaction, environment);
  const result = postProcess(
    contractAddress,
    prices,
    preventCancelDown,
    receipt,
  );
  return result;
};
