import {
  transactionFactory,
  GuardFunction,
  PrepareArgsFunction,
} from '~/utils/solidity/transactionFactory';
import { Contracts } from '~/Contracts';
import * as web3Utils from 'web3-utils';

export interface CancelOrderFromAccountOasisDexArgs {
  id: string;
}

const guard: GuardFunction<CancelOrderFromAccountOasisDexArgs> = async () => {
  // TODO
};

const prepareArgs: PrepareArgsFunction<
  CancelOrderFromAccountOasisDexArgs
> = async (_, { id }) => {
  return [id];
};

const postProcess = async (_, receipt) => {
  return { id: web3Utils.toDecimal(receipt.events.LogKill.returnValues.id) };
};

const cancelOrderFromAccountOasisDex = transactionFactory(
  'cancel',
  Contracts.MatchingMarket,
  guard,
  prepareArgs,
  postProcess,
);

export default cancelOrderFromAccountOasisDex;
