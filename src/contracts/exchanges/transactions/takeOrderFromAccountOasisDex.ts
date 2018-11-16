import {
  transactionFactory,
  GuardFunction,
  PrepareArgsFunction,
} from '~/utils/solidity';
import { QuantityInterface } from '@melonproject/token-math/quantity';
import { Contracts } from '~/Contracts';

export interface TakeOrderFromAccountOasisDexArgs {
  id: string;
  maxTakeAmount: QuantityInterface;
}

const guard: GuardFunction<TakeOrderFromAccountOasisDexArgs> = async (
  params,
  contractAddress,
  environment,
) => {
  // TODO
};

const prepareArgs: PrepareArgsFunction<
  TakeOrderFromAccountOasisDexArgs
> = async ({ id, maxTakeAmount }) => {
  return [id, maxTakeAmount.toString()];
};

const postProcess = async (receipt, params, contractAddress, environment) => {
  return { id: receipt.events.LogTake.returnValues.id };
};

const takeOrderFromAccountOasisDex = transactionFactory(
  'take',
  Contracts.MatchingMarket,
  guard,
  prepareArgs,
  postProcess,
);

export default takeOrderFromAccountOasisDex;
