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
  params,
  contractAddress,
  environment,
) => {
  // TODO

  await approve({ howMuch: params.buy, spender: contractAddress });
};

const prepareArgs: PrepareArgsFunction<
  TakeOrderFromAccountOasisDexArgs
> = async ({ id, maxTakeAmount }) => {
  return [id.toString(), maxTakeAmount.quantity.toString()];
};

const postProcess = async (receipt, params, contractAddress, environment) => {
  return {
    sold: createQuantity(
      params.buy.token,
      receipt.events.LogTrade.returnValues.buy_amt,
    ),
    bought: createQuantity(
      params.sell.token,
      receipt.events.LogTrade.returnValues.sell_amt,
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
