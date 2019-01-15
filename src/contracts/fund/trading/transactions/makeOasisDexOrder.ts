import * as web3Utils from 'web3-utils';
import { QuantityInterface, createQuantity } from '@melonproject/token-math';

import {
  PrepareArgsFunction,
  GuardFunction,
  PostProcessFunction,
  transactionFactory,
} from '~/utils/solidity/transactionFactory';
import { getExchangeIndex } from '../calls/getExchangeIndex';
import { ensureMakePermitted } from '~/contracts/fund/trading/guards/ensureMakePermitted';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { ensureSufficientBalance } from '~/contracts/dependencies/token/guards/ensureSufficientBalance';
import { getHub } from '~/contracts/fund/hub/calls/getHub';
import { getRoutes } from '~/contracts/fund/hub/calls/getRoutes';
import { ensureIsNotShutDown } from '~/contracts/fund/hub/guards/ensureIsNotShutDown';
import { ensureFundOwner } from '~/contracts/fund/trading/guards/ensureFundOwner';
import { Exchanges, Contracts } from '~/Contracts';
import { FunctionSignatures } from '../utils/FunctionSignatures';
import { emptyAddress } from '~/utils/constants/emptyAddress';

export type MakeOasisDexOrderResult = any;

export interface MakeOasisDexOrderArgs {
  makerQuantity: QuantityInterface;
  takerQuantity: QuantityInterface;
}

const guard: GuardFunction<MakeOasisDexOrderArgs> = async (
  environment,
  { makerQuantity, takerQuantity },
  contractAddress,
) => {
  const hubAddress = await getHub(environment, contractAddress);
  const { vaultAddress } = await getRoutes(environment, hubAddress);

  const minBalance = makerQuantity;
  await ensureSufficientBalance(environment, minBalance, vaultAddress);
  await ensureFundOwner(environment, contractAddress);
  await ensureIsNotShutDown(environment, hubAddress);

  // Ensure fund not shut down.
  // Ensure exchange method is allowed.
  // Ensure not buying/selling of own fund token.
  // Ensure price provided on this asset pair.
  // Ensure price feed data is not outdated.
  // Ensure there are no other open orders for the asset.

  // IF MATCHINGMARKET:
  // Ensure selling quantity is not too low.

  await ensureMakePermitted(
    environment,
    contractAddress,
    makerQuantity,
    takerQuantity,
  );
};

const prepareArgs: PrepareArgsFunction<MakeOasisDexOrderArgs> = async (
  environment,
  { makerQuantity, takerQuantity },
  contractAddress,
) => {
  const exchangeIndex = await getExchangeIndex(environment, contractAddress, {
    exchange: Exchanges.MatchingMarket,
  });

  return [
    exchangeIndex,
    FunctionSignatures.makeOrder,
    [
      contractAddress.toString(),
      emptyAddress,
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
      '0',
      0,
    ],
    web3Utils.padLeft('0x0', 64),
    web3Utils.padLeft('0x0', 64),
    web3Utils.padLeft('0x0', 64),
    web3Utils.padLeft('0x0', 64),
  ];
};

const postProcess: PostProcessFunction<
  MakeOasisDexOrderArgs,
  MakeOasisDexOrderResult
> = async (environment, receipt) => {
  const sellToken = await getToken(
    environment,
    receipt.events.LogMake.returnValues.pay_gem,
  );

  const buyToken = await getToken(
    environment,
    receipt.events.LogMake.returnValues.buy_gem,
  );

  return {
    buy: createQuantity(buyToken, receipt.events.LogMake.returnValues.buy_amt),
    id: web3Utils.toDecimal(receipt.events.LogMake.returnValues.id),
    maker: receipt.events.LogMake.returnValues.maker,
    sell: createQuantity(
      sellToken,
      receipt.events.LogMake.returnValues.pay_amt,
    ),
    timestamp: receipt.events.LogMake.returnValues.timestamp,
  };
};

const options = { gas: '8000000' };

const makeOasisDexOrder = transactionFactory(
  'callOnExchange',
  Contracts.Trading,
  guard,
  prepareArgs,
  postProcess,
  options,
);

export { makeOasisDexOrder };
