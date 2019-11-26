import { orderHashUtils } from '@0x/order-utils';
import { Contracts } from '~/Contracts';
import { callFactory } from '~/utils/solidity/callFactory';

const prepareArgs = (_, signedOrder) => {
  const orderHash = orderHashUtils.getOrderHashHex(signedOrder);
  const args = [orderHash, signedOrder.makerAddress, signedOrder.signature];
  return args;
};

const postProcess = async (_, result) => {
  return result;
};

const isValidSignature = callFactory(
  'isValidSignature',
  Contracts.ZeroExExchange,
  { prepareArgs, postProcess },
);

export { isValidSignature };
