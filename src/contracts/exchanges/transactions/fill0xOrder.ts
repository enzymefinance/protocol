import * as R from 'ramda';
import {
  transactionFactory,
  EnhancedExecute,
  PrepareArgsFunction,
  GuardFunction,
  stringifyStruct,
} from '~/utils/solidity';
import { Contracts } from '~/Contracts';
import { SignedOrder } from '@0x/types';
import { QuantityInterface } from '@melonproject/token-math/quantity';
import { get0xOrderInfo } from '../calls/get0xOrderInfo';
import { OrderStatus, signatureUtils, orderHashUtils } from '0x.js';
import { ensure } from '~/utils/guards';
import { isValidSignature } from '../calls/isValidSignature';

interface Fill0xOrderArgs {
  signedOrder: SignedOrder;
  takerQuantity?: QuantityInterface;
}

interface Fill0xOrderResult {
  makerFilledAmount: QuantityInterface;
  takerFilledAmount: QuantityInterface;
  makerFeePaid: QuantityInterface;
  takerFeePaid: QuantityInterface;
}

const guard: GuardFunction<Fill0xOrderArgs> = async (
  { signedOrder },
  contractAddress,
  environment,
) => {
  const orderInfo = await get0xOrderInfo(contractAddress, { signedOrder });
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

  console.log(offChainCheck);

  const validSignature = await isValidSignature(contractAddress, {
    signedOrder,
  });
  ensure(validSignature, 'Signature invalid');
};

const prepareArgs: PrepareArgsFunction<Fill0xOrderArgs> = async ({
  signedOrder,
  takerQuantity,
}) => {
  const stringifiedSignedOrder = stringifyStruct(signedOrder);

  const takerAssetAmount = takerQuantity
    ? takerQuantity.quantity.toString()
    : stringifiedSignedOrder.takerAssetAmount;

  const signature = stringifiedSignedOrder.signature;

  console.log(takerAssetAmount);

  return [
    R.omit(['signature'], stringifiedSignedOrder),
    takerAssetAmount,
    signature,
  ];
};

const fill0xOrder: EnhancedExecute<
  Fill0xOrderArgs,
  Fill0xOrderResult
> = transactionFactory(
  'fillOrder',
  Contracts.ZeroExExchange,
  guard,
  prepareArgs,
);

export { fill0xOrder };
