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
} from '@melonproject/token-math';
import { Contracts } from '~/Contracts';
import { approve } from '~/contracts/dependencies/token/transactions/approve';
import { ensure } from '~/utils/guards/ensure';
import { ensureSufficientBalance } from '~/contracts/dependencies/token/guards/ensureSufficientBalance';
import * as web3Utils from 'web3-utils';
import { getLogCurried } from '~/utils/environment/getLogCurried';

export interface CallOnExchangeArgs {
  sell: QuantityInterface;
  buy: QuantityInterface;
}

const getLog = getLogCurried(
  'melon:protocol:contracts:makeOrderFromAccountOasisDex',
);

const guard: GuardFunction<CallOnExchangeArgs> = async (
  environment,
  params,
  contractAddress,
) => {
  const log = getLog(environment);

  await approve(environment, {
    howMuch: params.sell,
    spender: contractAddress,
  });
  const oasisDexContract = getContract(
    environment,
    Contracts.MatchingMarket,
    contractAddress,
  );

  const dust = await oasisDexContract.methods
    ._dust(params.sell.token.address)
    .call();

  log.debug({ dust });

  ensure(
    greaterThan(params.sell, createQuantity(params.sell.token, dust)),
    'Selling quantity too low.',
  );

  log.debug(params.sell.token.address, params.buy.token.address);

  const isWhitelisted = await oasisDexContract.methods
    .isTokenPairWhitelisted(
      params.sell.token.address.toString(),
      params.buy.token.address.toString(),
    )
    .call();

  log.debug({ isWhitelisted });

  ensure(isWhitelisted, 'Token pair not whitelisted');

  ensureSufficientBalance(environment, params.sell, environment.wallet.address);

  log.debug('Sufficient balance');

  const isMarketClosed = await oasisDexContract.methods.isClosed().call();
  ensure(!isMarketClosed, 'Market closed');

  log.debug('Guards passed');
};

const prepareArgs: PrepareArgsFunction<CallOnExchangeArgs> = async (
  _,
  { sell, buy },
) => {
  return [
    sell.quantity.toString(),
    sell.token.address,
    buy.quantity.toString(),
    buy.token.address,
    0,
  ];
};

const postProcess = async (environment, receipt, params, contractAddress) => {
  const logEntry = receipt.events.LogMake || receipt.events.LogTake;

  ensure(
    !!logEntry,
    `No LogMake nor LogTake found in transaction: ${receipt.transactionHash}`,
  );

  const matched = !!receipt.events.LogTrade;

  return {
    buy: createQuantity(params.buy.token, logEntry.returnValues.buy_amt),
    id: web3Utils.toDecimal(logEntry.returnValues.id),
    maker: logEntry.returnValues.maker,
    matched,
    sell: createQuantity(params.sell.token, logEntry.returnValues.pay_amt),
    taker: logEntry.returnValues.taker,
    timestamp: logEntry.returnValues.timestamp,
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
