import { Address } from '@melonproject/token-math/address';
import { callFactory } from '~/utils/solidity';
import { Contracts } from '~/Contracts';
import { SignedOrder } from '@0x/types';
import { orderHashUtils } from '0x.js';

interface IsValidSignatureArgs {
  signedOrder: SignedOrder;
}

const prepareArgs = ({ signedOrder }: IsValidSignatureArgs) => {
  const orderHash = orderHashUtils.getOrderHashHex(signedOrder);
  return [orderHash, signedOrder.makerAddress, signedOrder.signature];
};

const postProcess = async result => {
  console.log(result);
  return result;
};

const isValidSignature = callFactory(
  'isValidSignature',
  Contracts.ZeroExExchange,
  { prepareArgs, postProcess },
);

export { isValidSignature };
