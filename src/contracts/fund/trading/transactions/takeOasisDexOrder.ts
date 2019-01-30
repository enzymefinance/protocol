import {
  QuantityInterface,
  Address,
  createQuantity,
  ensureSameToken,
} from '@melonproject/token-math';
import * as web3Utils from 'web3-utils';

import { transactionFactory } from '~/utils/solidity/transactionFactory';
import { getExchangeIndex } from '../calls/getExchangeIndex';
import { ensureSufficientBalance } from '~/contracts/dependencies/token/guards/ensureSufficientBalance';
import { getRoutes } from '~/contracts/fund/hub/calls/getRoutes';
import { getHub } from '~/contracts/fund/hub/calls/getHub';
import { ensureFundOwner } from '~/contracts/fund/trading/guards/ensureFundOwner';
import { ensureTakePermitted } from '../guards/ensureTakePermitted';
import { Exchanges, Contracts } from '~/Contracts';
import { FunctionSignatures } from '../utils/FunctionSignatures';
import { emptyAddress } from '~/utils/constants/emptyAddress';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { ensure } from '~/utils/guards/ensure';

export type TakeOasisDexOrderResult = any;

export interface TakeOasisDexOrderArgs {
  id: number;
  makerQuantity: QuantityInterface;
  takerQuantity: QuantityInterface;
  maker: Address;
  fillTakerQuantity?: QuantityInterface;
}

const guard = async (
  environment,
  { id, makerQuantity, takerQuantity, fillTakerQuantity = takerQuantity },
  contractAddress,
) => {
  const hubAddress = await getHub(environment, contractAddress);
  const { vaultAddress } = await getRoutes(environment, hubAddress);

  await ensureSufficientBalance(environment, fillTakerQuantity, vaultAddress);
  await ensureFundOwner(environment, contractAddress);
  await ensureSameToken(fillTakerQuantity.token, takerQuantity.token);

  // TODO: add all preflights

  await ensureTakePermitted(
    environment,
    contractAddress,
    Exchanges.MatchingMarket,
    makerQuantity,
    takerQuantity,
    fillTakerQuantity,
    id,
  );
};

const prepareArgs = async (
  environment,
  {
    id,
    makerQuantity,
    takerQuantity,
    maker,
    fillTakerQuantity = takerQuantity,
  },
  contractAddress,
) => {
  const exchangeIndex = await getExchangeIndex(environment, contractAddress, {
    exchange: Exchanges.MatchingMarket,
  });

  return [
    exchangeIndex,
    FunctionSignatures.takeOrder,
    [
      maker.toString(),
      contractAddress.toString(),
      makerQuantity.token.address.toString(),
      takerQuantity.token.address.toString(),
      emptyAddress,
      emptyAddress,
    ],
    [
      makerQuantity.quantity.toString(),
      takerQuantity.quantity.toString(),
      '0',
      '0',
      '0',
      '0',
      fillTakerQuantity.quantity.toString(),
      0,
    ],
    `0x${Number(id)
      .toString(16)
      .padStart(64, '0')}`,
    web3Utils.padLeft('0x0', 64),
    web3Utils.padLeft('0x0', 64),
    web3Utils.padLeft('0x0', 64),
  ];
};

const postProcess = async (environment, receipt) => {
  const logTake = receipt.events.LogTake.returnValues;

  ensure(!!logTake, 'No LogTake found in logs');

  const sellToken = await getToken(environment, logTake.pay_gem);
  const buyToken = await getToken(environment, logTake.buy_gem);

  return {
    buy: createQuantity(buyToken, logTake.take_amt),
    id: web3Utils.toDecimal(logTake.id),
    maker: new Address(logTake.maker),
    sell: createQuantity(sellToken, logTake.give_amt),
    taker: new Address(logTake.taker),
    timestamp: logTake.timestamp,
  };
};

const options = { gas: '8000000' };

const takeOasisDexOrder = transactionFactory<
  TakeOasisDexOrderArgs,
  TakeOasisDexOrderResult
>(
  'callOnExchange',
  Contracts.Trading,
  guard,
  prepareArgs,
  postProcess,
  options,
);

export { takeOasisDexOrder };
