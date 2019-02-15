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
import { kyberEthAddress } from '~/utils/constants/kyberEthAddress';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { getTokenBySymbol } from '~/utils/environment/getTokenBySymbol';

export interface TakeOrderOnKyberArgs {
  makerQuantity: QuantityInterface;
  takerQuantity: QuantityInterface;
  fillTakerQuantity?: QuantityInterface;
}

export interface TakeOrderOnKyberResult {
  makerQuantity: QuantityInterface;
  takerQuantity: QuantityInterface;
}

const guard: GuardFunction<TakeOrderOnKyberArgs> = async (
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
    Exchanges.KyberNetwork,
    makerQuantity,
    takerQuantity,
    fillTakerQuantity,
  );
};

const prepareArgs: PrepareArgsFunction<TakeOrderOnKyberArgs> = async (
  environment,
  { makerQuantity, takerQuantity, fillTakerQuantity = takerQuantity },
  contractAddress,
) => {
  const exchangeIndex = await getExchangeIndex(environment, contractAddress, {
    exchange: Exchanges.KyberNetwork,
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
  TakeOrderOnKyberArgs,
  TakeOrderOnKyberResult
> = async (environment, receipt) => {
  const kyberTrade =
    R.path(['events', 'KyberTrade', 'returnValues'], receipt) ||
    R.path(['events', 'TradeExecute', 'returnValues'], receipt);

  ensure(!!kyberTrade, 'No KyberTrade event log found in receipt');

  const weth = getTokenBySymbol(environment, 'WETH');

  const srcToken = kyberTrade.srcToken || kyberTrade.src;

  const sellToken =
    srcToken === kyberEthAddress
      ? weth
      : await getToken(environment, kyberTrade.srcToken);

  const buyToken =
    kyberTrade.destToken === kyberEthAddress
      ? weth
      : await getToken(environment, kyberTrade.destToken);

  const makerQuantity = createQuantity(buyToken, kyberTrade.destAmount);
  const takerQuantity = createQuantity(sellToken, kyberTrade.srcAmount);

  return {
    makerQuantity,
    takerQuantity,
  };
};

const takeOrderOnKyber = transactionFactory(
  'callOnExchange',
  Contracts.Trading,
  guard,
  prepareArgs,
  postProcess,
);

export { takeOrderOnKyber };
