import * as R from 'ramda';
import {
  OrderStatus,
  signatureUtils,
  orderHashUtils,
  assetDataUtils,
} from '0x.js';
import { SignedOrder } from '@0x/types';

import {
  QuantityInterface,
  createQuantity,
} from '@melonproject/token-math/quantity';
import { TokenInterface } from '@melonproject/token-math/token';

import {
  transactionFactory,
  EnhancedExecute,
  PrepareArgsFunction,
  GuardFunction,
  stringifyStruct,
  PostProcessFunction,
} from '~/utils/solidity';
import { Contracts } from '~/Contracts';
import { getOrderInfo } from '../calls/getOrderInfo';
import { ensure } from '~/utils/guards';
import { isValidSignature } from '../calls/isValidSignature';
import { getToken, approve } from '~/contracts/dependencies/token';
import { getAssetProxy } from '../calls/getAssetProxy';
import { getFeeToken } from '../calls/getFeeToken';

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
  { signedOrder, takerQuantity: providedTakerQuantity },
  contractAddress,
  environment,
) => {
  const orderInfo = await getOrderInfo(contractAddress, { signedOrder });

  ensure(
    orderInfo.status === `${OrderStatus.FILLABLE}`,
    `Order is not fillable. Got status: ${OrderStatus[orderInfo.status]}`,
  );

  const orderHash = orderHashUtils.getOrderHashHex(signedOrder);
  const offChainCheck = await signatureUtils.isValidSignatureAsync(
    environment.eth.currentProvider,
    orderHash,
    signedOrder.signature,
    signedOrder.makerAddress,
  );

  const validSignature = await isValidSignature(contractAddress, {
    signedOrder,
  });
  ensure(validSignature && offChainCheck, 'Signature invalid');

  const { tokenAddress } = assetDataUtils.decodeERC20AssetData(
    signedOrder.takerAssetData,
  );

  const takerToken = await getToken(tokenAddress, environment);

  const takerQuantity =
    providedTakerQuantity ||
    createQuantity(takerToken, signedOrder.takerAssetAmount.toString());

  const erc20Proxy = await getAssetProxy(contractAddress);

  await approve({ howMuch: takerQuantity, spender: erc20Proxy }, environment);
};

const prepareArgs: PrepareArgsFunction<FillOrderArgs> = async ({
  signedOrder,
  takerQuantity,
}) => {
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
  { fillValues, feeToken }: { fillValues: any; feeToken: TokenInterface },
  environment,
) => {
  const makerToken = await getToken(
    assetDataUtils.decodeERC20AssetData(fillValues.makerAssetData).tokenAddress,
    environment,
  );
  const takerToken = await getToken(
    assetDataUtils.decodeERC20AssetData(fillValues.takerAssetData).tokenAddress,
    environment,
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
  receipt,
  params,
  contractAddress,
  environment,
) => {
  const fillValues = receipt.events.Fill.returnValues;
  const feeToken = await getFeeToken(contractAddress, undefined, environment);

  const result = await parse0xFillReceipt(
    { fillValues, feeToken },
    environment,
  );
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
