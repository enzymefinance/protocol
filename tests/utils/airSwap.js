const { orders, signatures } = require('@airswap/order-utils');
const { GANACHE_PROVIDER } = require('@airswap/order-utils').constants;
import { ENCODING_TYPES } from '~/utils/constants';
import { encodeArgs } from '~/utils/formatting';

export const createUnsignedAirSwapOrder = async ({
  signerId,
  signerWallet,
  signerToken,
  signerTokenAmount,
  signerKind,
  senderId,
  senderWallet,
  senderToken,
  senderTokenAmount,
  senderKind,
  nonce,
  version,
  duration = 24 * 60 * 60, // 1 day
}, web3) => {
  const latestBlock = await web3.eth.getBlock('latest');

  const order = await orders.getOrder({
    signer: {
      wallet: signerWallet,
      token: signerToken,
      amount: signerTokenAmount,
    },
    sender: {
      wallet: senderWallet,
      token: senderToken,
      amount: senderTokenAmount,
    },
    affiliate: {
      kind: '0x0',
    },
    expiry: latestBlock.timestamp + duration,
  });

  order.signer.id = signerId ? signerId : order.signer.id;
  order.signer.kind = signerKind ? signerKind : order.signer.kind;
  order.sender.id = senderId ? senderId : order.sender.id;
  order.sender.kind = senderKind ? senderKind : order.sender.kind;
  order.nonce = nonce ? nonce : order.nonce;
  order.version = version ? version : order.version;

  return order;
};

export const signAirSwapOrder = async (order, exchangeAddress, signer) => {
  order.signature = await signatures.getWeb3Signature(
    order,
    signer,
    exchangeAddress,
    GANACHE_PROVIDER,
  );

  expect(orders.isValidOrder(order)).toBe(true);
  return order;
};

export const encodeAirSwapTakeOrderArgs = (order, web3) => {
  const orderAddresses = [];
  const orderValues = [];
  const tokenKinds = [];
  const sigBytesComponents = [];

  orderAddresses[0] = order.signer.wallet;
  orderAddresses[1] = order.signer.token;
  orderAddresses[2] = order.sender.wallet;
  orderAddresses[3] = order.sender.token;
  orderAddresses[4] = order.signature.signatory;
  orderAddresses[5] = order.signature.validator;

  orderValues[0] = order.nonce;
  orderValues[1] = order.expiry;
  orderValues[2] = order.signer.amount;
  orderValues[3] = order.signer.id;
  orderValues[4] = order.sender.amount;
  orderValues[5] = order.sender.id;

  tokenKinds[0] = order.signer.kind;
  tokenKinds[1] = order.sender.kind;
  sigBytesComponents[0] = order.signature.r;
  sigBytesComponents[1] = order.signature.s;
  const sigUintComponent = order.signature.v;
  const version = order.signature.version;

  const args = [
    orderAddresses,
    orderValues,
    tokenKinds,
    sigBytesComponents,
    sigUintComponent,
    version
  ];
  return encodeArgs(ENCODING_TYPES.AIR_SWAP, args, web3);
};
