import { SignedOrder } from '@0x/types';
import { orderHashUtils } from '@0x/order-utils';

import { Contracts } from '~/Contracts';
import { callFactory } from '~/utils/solidity/callFactory';

interface IsValidSignatureArgs {
  signedOrder: SignedOrder;
}

const prepareArgs = ({ signedOrder }: IsValidSignatureArgs, _, environment) => {
  const orderHash = orderHashUtils.getOrderHashHex(signedOrder);
  const args = [orderHash, signedOrder.makerAddress, signedOrder.signature];
  return args;
};

const postProcess = async result => {
  return result;
};

const isValidSignature = callFactory(
  'isValidSignature',
  Contracts.ZeroExExchange,
  { prepareArgs, postProcess },
);

export { isValidSignature };
