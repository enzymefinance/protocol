import * as web3Utils from 'web3-utils';
import {
  QuantityInterface,
  createQuantity,
} from '@melonproject/token-math/quantity';

import {
  PrepareArgsFunction,
  withTransactionDecorator,
  GuardFunction,
  PostProcessFunction,
} from '~/utils/solidity/transactionFactory';
import { getExchangeIndex } from '../calls/getExchangeIndex';
import { callOnExchange } from '~/contracts/fund/trading/transactions/callOnExchange';
import { ensureMakePermitted } from '~/contracts/fund/trading/guards/ensureMakePermitted';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { ensureSufficientBalance } from '~/contracts/dependencies/token/guards/ensureSufficientBalance';
import { getHub } from '~/contracts/fund/hub/calls/getHub';
import { getSettings } from '~/contracts/fund/hub/calls/getSettings';
import { ensureIsNotShutDown } from '~/contracts/fund/hub/guards/ensureIsNotShutDown';
import { ensureFundOwner } from '~/contracts/fund/trading/guards/ensureFundOwner';
import { Exchanges } from '~/Contracts';
import { FunctionSignatures } from '../utils/FunctionSignatures';

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
  const { vaultAddress } = await getSettings(environment, hubAddress);

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

  return {
    dexySignatureMode: 0,
    exchangeIndex,
    feeRecipient: '0x0000000000000000000000000000000000000000',
    fillTakerTokenAmount: '0',
    identifier: web3Utils.padLeft('0x0', 64),
    maker: contractAddress.toString(),
    makerAsset: makerQuantity.token.address.toString(),
    makerAssetData: web3Utils.padLeft('0x0', 64),
    makerFee: '0',
    makerQuantity: makerQuantity.quantity,
    method: FunctionSignatures.makeOrder,
    salt: '0',
    senderAddress: '0x0000000000000000000000000000000000000000',
    signature: web3Utils.padLeft('0x0', 64),
    taker: '0x0000000000000000000000000000000000000000',
    takerAsset: takerQuantity.token.address.toString(),
    takerAssetData: web3Utils.padLeft('0x0', 64),
    takerFee: '0',
    takerQuantity: takerQuantity.quantity,
    timestamp: '0',
  };
};

const postProcess: PostProcessFunction<
  MakeOasisDexOrderArgs,
  MakeOasisDexOrderResult
> = async (environment, receipt) => {
  const sellToken = await getToken(
    environment,
    receipt.events.LogMake.returnValues.pay_gem,
  );
  return {
    buy: createQuantity(sellToken, receipt.events.LogMake.returnValues.buy_amt),
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

const makeOasisDexOrder = withTransactionDecorator(callOnExchange, {
  guard,
  options,
  postProcess,
  prepareArgs,
});

export { makeOasisDexOrder };
