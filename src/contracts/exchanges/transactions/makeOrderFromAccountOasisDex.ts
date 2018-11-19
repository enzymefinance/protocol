import {
  transactionFactory,
  GuardFunction,
  PrepareArgsFunction,
  getContract,
} from '~/utils/solidity';
import {
  QuantityInterface,
  createQuantity,
  greaterThan,
} from '@melonproject/token-math/quantity';
import { Contracts } from '~/Contracts';
import { approve } from '~/contracts/dependencies/token/transactions/approve';
import { ensure } from '~/utils/guards';

export interface CallOnExchangeArgs {
  sell: QuantityInterface;
  buy: QuantityInterface;
}

const guard: GuardFunction<CallOnExchangeArgs> = async (
  params,
  contractAddress,
  environment,
) => {
  await approve({ howMuch: params.sell, spender: environment.wallet.address });
  const oasisDexContract = getContract(
    Contracts.MatchingMarket,
    contractAddress,
  );
  const dust = await oasisDexContract.methods._dust().call();
  ensure(greaterThan(params.sell, dust), 'Selling quantity too low.');
};

const prepareArgs: PrepareArgsFunction<CallOnExchangeArgs> = async ({
  sell,
  buy,
}) => {
  return [
    sell.quantity.toString(),
    sell.token.address,
    buy.quantity.toString(),
    buy.token.address,
    0,
  ];
};

const postProcess = async (receipt, params, contractAddress, environment) => {
  return {
    receipt,
    id: receipt.events.LogMake.returnValues.id,
    maker: receipt.events.LogMake.returnValues.maker,
    taker: receipt.events.LogMake.returnValues.taker,
    sell: createQuantity(
      receipt.events.LogMake.returnValues.pay_gem,
      receipt.events.LogMake.returnValues.pay_amt,
    ),
    buy: createQuantity(
      receipt.events.LogMake.returnValues.buy_gem,
      receipt.events.LogMake.returnValues.buy_amt,
    ),
    timestamp: receipt.events.LogMake.returnValues.timestamp,
  };
};

const makeOrderFromAccountOasisDex = transactionFactory(
  'offer',
  Contracts.MatchingMarket,
  guard,
  prepareArgs,
  postProcess,
);

export { makeOrderFromAccountOasisDex };
