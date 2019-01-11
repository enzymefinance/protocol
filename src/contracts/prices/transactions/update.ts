import { isEqual, PriceInterface, toAtomic } from '@melonproject/token-math';
import { ensureAccountAddress } from '~/utils/environment/ensureAccountAddress';
import { ensureAddress } from '~/utils/checks/isAddress';
import { ensure } from '~/utils/guards/ensure';
import { getPrices } from '../calls/getPrices';
import { Contracts } from '~/Contracts';
import { Environment } from '~/utils/environment/Environment';
import {
  transactionFactory,
  GuardFunction,
  PrepareArgsFunction,
  PostProcessFunction,
} from '~/utils/solidity/transactionFactory';

type UpdateParams = PriceInterface[];

const guard: GuardFunction<UpdateParams> = async (
  environment: Environment,
  _,
  contractAddress,
) => {
  ensureAddress(contractAddress);
  ensureAccountAddress(environment);

  // TODO: check if given price is against quote
};

const prepareArgs: PrepareArgsFunction<UpdateParams> = async (_, prices) => [
  prices.map(p => p.base.token.address),
  prices.map(p => `${toAtomic(p)}`),
];

const postProcess: PostProcessFunction<UpdateParams, UpdateParams> = async (
  environment: Environment,
  _,
  prices,
  contractAddress,
) => {
  const updatedPrices = await getPrices(
    environment,
    contractAddress,
    prices.map(p => p.base.token),
  );

  ensure(isEqual(updatedPrices[0], prices[0]), 'Price did not update', {
    is: JSON.stringify(updatedPrices[0]),
    should: JSON.stringify(prices[0]),
  });

  return updatedPrices;
};

export const update = transactionFactory(
  'update',
  Contracts.TestingPriceFeed,
  guard,
  prepareArgs,
  postProcess,
);
