import {
  transactionFactory,
  GuardFunction,
  PrepareArgsFunction,
} from '~/utils/solidity/transactionFactory';
import {
  QuantityInterface,
  createQuantity,
} from '@melonproject/token-math/quantity';
import { Contracts } from '~/Contracts';
import { approve } from '~/contracts/dependencies/token/transactions/approve';

export interface TakeOrderFromAccountOasisDexArgs {
  id: number;
  maxTakeAmount: QuantityInterface;
  sell: QuantityInterface;
  buy: QuantityInterface;
}

const guard: GuardFunction<TakeOrderFromAccountOasisDexArgs> = async (
  environment,
  params,
  contractAddress,
) => {
  // TODO

  await approve(environment, {
    howMuch: params.buy,
    spender: contractAddress.toString(),
  });
};

const prepareArgs: PrepareArgsFunction<
  TakeOrderFromAccountOasisDexArgs
> = async (_, { id, maxTakeAmount }) => {
  return [id.toString(), maxTakeAmount.quantity.toString()];
};

const postProcess = async (environment, receipt, params, contractAddress) => {
  return {
    bought: createQuantity(
      params.sell.token,
      receipt.events.LogTrade.returnValues.sell_amt,
    ),
    sold: createQuantity(
      params.buy.token,
      receipt.events.LogTrade.returnValues.buy_amt,
    ),
  };
};

const takeOrderFromAccountOasisDex = transactionFactory(
  'buy',
  Contracts.MatchingMarket,
  guard,
  prepareArgs,
  postProcess,
);

export default takeOrderFromAccountOasisDex;
