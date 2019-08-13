import * as R from 'ramda';
import * as web3Utils from 'web3-utils';

import { QuantityInterface, createQuantity } from '@melonproject/token-math';

import { Contracts, Exchanges } from '~/Contracts';
import { getExchangeIndex } from '../calls/getExchangeIndex';
import { emptyAddress } from '~/utils/constants/emptyAddress';
import {
  GuardFunction,
  PrepareArgsFunction,
  transactionFactory,
  PostProcessFunction,
} from '~/utils/solidity/transactionFactory';
import { getHub } from '../../hub/calls/getHub';
import { getRoutes } from '../../hub/calls/getRoutes';
import { ensureSufficientBalance } from '~/contracts/dependencies/token/guards/ensureSufficientBalance';
import { ensureFundOwner } from '~/contracts/fund/trading/guards/ensureFundOwner';
import { ensureIsNotShutDown } from '~/contracts/fund/hub/guards/ensureIsNotShutDown';
import { ensureTakePermitted } from '../guards/ensureTakePermitted';
import { FunctionSignatures } from '../utils/FunctionSignatures';
import { ensure } from '~/utils/guards/ensure';

export interface TakeOrderOnUniswapArgs {
  makerQuantity: QuantityInterface;
  takerQuantity: QuantityInterface;
  fillTakerQuantity?: QuantityInterface;
}

export interface TakeOrderOnUniswapResult {
  makerQuantity: QuantityInterface;
  takerQuantity: QuantityInterface;
}

const guard: GuardFunction<TakeOrderOnUniswapArgs> = async (
  environment,
  { makerQuantity, takerQuantity, fillTakerQuantity = takerQuantity },
  contractAddress,
) => {
  const hubAddress = await getHub(environment, contractAddress);
  const { vaultAddress } = await getRoutes(environment, hubAddress);

  await ensureSufficientBalance(environment, takerQuantity, vaultAddress);
  await ensureFundOwner(environment, contractAddress);
  await ensureIsNotShutDown(environment, hubAddress);

  await ensureTakePermitted(
    environment,
    contractAddress,
    Exchanges.UniswapFactory,
    makerQuantity,
    takerQuantity,
    fillTakerQuantity,
  );
};

const prepareArgs: PrepareArgsFunction<TakeOrderOnUniswapArgs> = async (
  environment,
  { makerQuantity, takerQuantity, fillTakerQuantity = takerQuantity },
  contractAddress,
) => {
  const exchangeIndex = await getExchangeIndex(environment, contractAddress, {
    exchange: Exchanges.UniswapFactory,
  });

  const takerAsset = takerQuantity.token.address;
  const makerAsset = makerQuantity.token.address;
  const takerAssetAmount = takerQuantity.quantity.toString();
  const makerAssetAmount = makerQuantity.quantity.toString();
  const fillTakerAmount = fillTakerQuantity.quantity.toString();

  const args = [
    exchangeIndex,
    FunctionSignatures.takeOrder,
    [
      emptyAddress,
      emptyAddress,
      makerAsset,
      takerAsset,
      emptyAddress,
      emptyAddress,
    ],
    [makerAssetAmount, takerAssetAmount, 0, 0, 0, 0, fillTakerAmount, 0],
    web3Utils.padLeft('0x0', 64),
    web3Utils.padLeft('0x0', 64),
    web3Utils.padLeft('0x0', 64),
    web3Utils.padLeft('0x0', 64),
  ];

  return args;
};

const postProcess: PostProcessFunction<
  TakeOrderOnUniswapArgs,
  TakeOrderOnUniswapResult
> = async (environment, receipt, params) => {
  const uniswapEvent =
    R.path(['events', 'TokenPurchase', 'returnValues'], receipt) ||
    R.path(['events', 'EthPurchase', 'returnValues'], receipt);

  ensure(!!uniswapEvent, 'No Uniswap event log found in receipt');

  const makerQuantity = createQuantity(
    params.makerQuantity.token,
    uniswapEvent.tokens_bought || uniswapEvent.eth_bought,
  );
  const takerQuantity = params.takerQuantity;

  return {
    makerQuantity,
    takerQuantity,
  };
};

const takeOrderOnUniswap = transactionFactory(
  'callOnExchange',
  Contracts.Trading,
  guard,
  prepareArgs,
  postProcess,
);

export { takeOrderOnUniswap };
