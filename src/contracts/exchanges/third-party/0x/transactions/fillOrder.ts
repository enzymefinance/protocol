import * as R from 'ramda';
import { assetDataUtils } from '@0x/order-utils';
import { OrderStatus } from '@0x/contract-wrappers';
import { SignedOrder } from '@0x/types';
import {
  createQuantity,
  QuantityInterface,
  TokenInterface,
} from '@melonproject/token-math';

import { Contracts } from '~/Contracts';
import {
  GuardFunction,
  PrepareArgsFunction,
  PostProcessFunction,
  EnhancedExecute,
  transactionFactory,
} from '~/utils/solidity/transactionFactory';
import { ensure } from '~/utils/guards/ensure';
import { approve } from '~/contracts/dependencies/token/transactions/approve';
import { stringifyStruct } from '~/utils/solidity/stringifyStruct';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { getOrderInfo } from '../calls/getOrderInfo';
import { isValidSignature } from '../calls/isValidSignature';
import { getAssetProxy } from '../calls/getAssetProxy';
import { getFeeToken } from '../calls/getFeeToken';
import { Environment } from '~/utils/environment/Environment';

export interface FillOrderArgs {
  signedOrder: SignedOrder;
  takerQuantity?: QuantityInterface;
}

export interface FillOrderResult {
  makerFilledAmount: QuantityInterface;
  takerFilledAmount: QuantityInterface;
  makerFeePaid: QuantityInterface;
  takerFeePaid: QuantityInterface;
}

const guard: GuardFunction<FillOrderArgs> = async (
  environment,
  { signedOrder, takerQuantity: providedTakerQuantity },
  contractAddress,
) => {
  const orderInfo = await getOrderInfo(environment, contractAddress, {
    signedOrder,
  });

  ensure(
    orderInfo.status === `${OrderStatus.FILLABLE}`,
    `Order is not fillable. Got status: ${OrderStatus[orderInfo.status]}`,
  );

  const validSignature = await isValidSignature(environment, contractAddress, {
    signedOrder,
  });

  ensure(validSignature, 'Signature invalid');

  const { tokenAddress } = assetDataUtils.decodeERC20AssetData(
    signedOrder.takerAssetData,
  );

  const takerToken = await getToken(environment, tokenAddress);

  const takerQuantity =
    providedTakerQuantity ||
    createQuantity(takerToken, signedOrder.takerAssetAmount.toString());

  const erc20Proxy = await getAssetProxy(environment, contractAddress);

  await approve(environment, { howMuch: takerQuantity, spender: erc20Proxy });
};

const prepareArgs: PrepareArgsFunction<FillOrderArgs> = async (
  _,
  { signedOrder, takerQuantity },
) => {
  const stringifiedSignedOrder = stringifyStruct(signedOrder);

  const takerAssetAmount = takerQuantity
    ? takerQuantity.quantity.toString()
    : stringifiedSignedOrder.takerAssetAmount;

  const signature = stringifiedSignedOrder.signature;

  return [
    R.omit(['signature'], stringifiedSignedOrder),
    takerAssetAmount,
    signature,
  ];
};

const parse0xFillReceipt = async (
  environment: Environment,
  { fillValues, feeToken }: { fillValues: any; feeToken: TokenInterface },
) => {
  const makerToken = await getToken(
    environment,
    assetDataUtils.decodeERC20AssetData(fillValues.makerAssetData).tokenAddress,
  );
  const takerToken = await getToken(
    environment,
    assetDataUtils.decodeERC20AssetData(fillValues.takerAssetData).tokenAddress,
  );

  const result = {
    makerFeePaid: createQuantity(feeToken, fillValues.makerFeePaid),
    makerFilledAmount: createQuantity(
      makerToken,
      fillValues.makerAssetFilledAmount.toString(),
    ),
    takerFeePaid: createQuantity(feeToken, fillValues.takerFeePaid),
    takerFilledAmount: createQuantity(
      takerToken,
      fillValues.takerAssetFilledAmount.toString(),
    ),
  };

  return result;
};

const postProcess: PostProcessFunction<FillOrderArgs, FillOrderResult> = async (
  environment,
  receipt,
  params,
  contractAddress,
) => {
  const fillValues = receipt.events.Fill.returnValues;
  const feeToken = await getFeeToken(environment, contractAddress);

  const result = await parse0xFillReceipt(environment, {
    feeToken,
    fillValues,
  });
  return result;
};

const fillOrder: EnhancedExecute<
  FillOrderArgs,
  FillOrderResult
> = transactionFactory(
  'fillOrder',
  Contracts.ZeroExExchange,
  guard,
  prepareArgs,
  postProcess,
);

export { fillOrder, parse0xFillReceipt };
