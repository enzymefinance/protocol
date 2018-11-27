import { getContract } from '~/utils/solidity/getContract';
import {
  transactionFactory,
  GuardFunction,
  PrepareArgsFunction,
} from '~/utils/solidity/transactionFactory';
import {
  QuantityInterface,
  createQuantity,
  greaterThan,
} from '@melonproject/token-math/quantity';
import { Contracts } from '~/Contracts';
import { approve } from '~/contracts/dependencies/token/transactions/approve';
import { ensure } from '~/utils/guards/ensure';
import { ensureSufficientBalance } from '~/contracts/dependencies/token/guards/ensureSufficientBalance';
import * as web3Utils from 'web3-utils';
export interface CallOnExchangeArgs {
  sell: QuantityInterface;
  buy: QuantityInterface;
}

const guard: GuardFunction<CallOnExchangeArgs> = async (
  params,
  contractAddress,
  environment,
) => {
  await approve({ howMuch: params.sell, spender: contractAddress });
  const oasisDexContract = getContract(
    Contracts.MatchingMarket,
    contractAddress,
  );
  const dust = await oasisDexContract.methods
    ._dust(params.sell.token.address)
    .call();
  ensure(
    greaterThan(params.sell, createQuantity(params.sell.token, dust)),
    'Selling quantity too low.',
  );

  const isWhitelisted = await oasisDexContract.methods
    .isTokenPairWhitelisted(params.sell.token.address, params.buy.token.address)
    .call();

  ensure(isWhitelisted, 'Token pair not whitelisted');

  ensureSufficientBalance(params.sell, environment.wallet.address, environment);

  const isMarketClosed = await oasisDexContract.methods.isClosed().call();
  ensure(!isMarketClosed, 'Market closed');
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
    id: web3Utils.toDecimal(receipt.events.LogMake.returnValues.id),
    maker: receipt.events.LogMake.returnValues.maker,
    taker: receipt.events.LogMake.returnValues.taker,
    sell: createQuantity(
      params.sell.token,
      receipt.events.LogMake.returnValues.pay_amt,
    ),
    buy: createQuantity(
      params.buy.token,
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
