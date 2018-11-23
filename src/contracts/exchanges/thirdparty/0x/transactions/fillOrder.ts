import * as R from 'ramda';
import {
  OrderStatus,
  signatureUtils,
  orderHashUtils,
  assetDataUtils,
} from '0x.js';
import { SignedOrder } from '@0x/types';

import {
  transactionFactory,
  EnhancedExecute,
  PrepareArgsFunction,
  GuardFunction,
  stringifyStruct,
} from '~/utils/solidity';
import { Contracts } from '~/Contracts';
import {
  QuantityInterface,
  createQuantity,
} from '@melonproject/token-math/quantity';
import { getOrderInfo } from '../calls/getOrderInfo';
import { ensure } from '~/utils/guards';
import { isValidSignature } from '../calls/isValidSignature';
import { getToken, approve } from '~/contracts/dependencies/token';
import { getAssetProxy } from '../calls/getAssetProxy';

interface FillOrderArgs {
  signedOrder: SignedOrder;
  takerQuantity?: QuantityInterface;
}

interface FillOrderResult {
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

  await approve({ howMuch: takerQuantity, spender: erc20Proxy });
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

const fillOrder: EnhancedExecute<
  FillOrderArgs,
  FillOrderResult
> = transactionFactory(
  'fillOrder',
  Contracts.ZeroExExchange,
  guard,
  prepareArgs,
);

export { fillOrder };
