const { orders, signatures } = require('@airswap/order-utils');
const { GANACHE_PROVIDER } = require('@airswap/order-utils').constants;
import { CALL_ON_INTEGRATION_ENCODING_TYPES } from '~/utils/constants';
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
}) => {
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

export const encodeAirSwapTakeOrderArgs = (order) => {
  const encodedZeroExOrder = encodeArgs(
    CALL_ON_INTEGRATION_ENCODING_TYPES.AIR_SWAP.ORDER,
    [ 
      // address type
      [
        order.signer.wallet,
        order.signer.token,
        order.sender.wallet,
        order.sender.token,
        order.signature.signatory,
        order.signature.validator
      ],
      // uint256 type
      [ 
        order.nonce,
        order.expiry,
        order.signer.amount,
        order.signer.id,
        order.sender.amount,
        order.sender.id
      ],
      // bytes4 type
      [
        order.signer.kind,
        order.sender.kind
      ],
      // bytes32 type
      [
        order.signature.r,
        order.signature.s
      ],
      // uint8 type
      order.signature.v,
      // bytes1 type
      order.signature.version
    ]
  );

  return encodeArgs(
    CALL_ON_INTEGRATION_ENCODING_TYPES.AIR_SWAP.TAKE_ORDER,
    [
      encodedZeroExOrder, // AIR_SWAP.ORDER
    ]
  );
};
