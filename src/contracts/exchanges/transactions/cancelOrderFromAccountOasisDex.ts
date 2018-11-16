import {
  transactionFactory,
  GuardFunction,
  PrepareArgsFunction,
} from '~/utils/solidity';
import { Contracts } from '~/Contracts';

export interface CancelOrderFromAccountOasisDexArgs {
  id: string;
}

const guard: GuardFunction<CancelOrderFromAccountOasisDexArgs> = async (
  params,
  contractAddress,
  environment,
) => {
  // TODO
};

const prepareArgs: PrepareArgsFunction<
  CancelOrderFromAccountOasisDexArgs
> = async ({ id }) => {
  return [id];
};

const postProcess = async (receipt, params, contractAddress, environment) => {
  return { id: receipt.events.LogKill.returnValues.id };
};

const cancelOrderFromAccountOasisDex = transactionFactory(
  'cancel',
  Contracts.MatchingMarket,
  guard,
  prepareArgs,
  postProcess,
);

export default cancelOrderFromAccountOasisDex;
