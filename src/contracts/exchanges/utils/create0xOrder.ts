// tslint:disable:max-line-length
/*
"TODO: Remove this
ReferenceError: regeneratorRuntime is not defined
  at node_modules/@ledgerhq/hw-transport-u2f/lib/TransportU2F.js:120:50      at node_modules/@ledgerhq/hw-transport-u2f/lib/TransportU2F.js:142:6
  at Object.<anonymous> (node_modules/@ledgerhq/hw-transport-u2f/lib/TransportU2F.js:228:2)
  at Object.<anonymous> (node_modules/@0xproject/subproviders/src/index.ts:2:1)
*/
// tslint:enable:max-line-length
import 'babel-polyfill';

import {
  assetDataUtils,
  BigNumber,
  generatePseudoRandomSalt,
  orderHashUtils,
} from '0x.js';
import { Order, SignedOrder } from '@0x/types';
import { constants } from '@0x/order-utils/lib/src/constants';
import { getGlobalEnvironment } from '~/utils/environment';
import { Address } from '@melonproject/token-math/address';
import { QuantityInterface } from '@melonproject/token-math/quantity';
import { approve } from '~/contracts/dependencies/token';

interface Create0xOrderArgs {
  from: Address;
  makerQuantity: QuantityInterface;
  takerQuantity: QuantityInterface;
  duration?: number;
}

interface Sign0xOrderArgs {
  order: Order;
  orderHash: string;
}

const create0xOrder = async (
  exchangeAddress: Address,
  { from, makerQuantity, takerQuantity, duration = 60 * 60 }: Create0xOrderArgs,
): Promise<Sign0xOrderArgs> => {
  console.log('create0xOrder', from, makerQuantity);
  await approve({ howMuch: makerQuantity, spender: exchangeAddress });

  const makerAssetData = assetDataUtils.encodeERC20AssetData(
    makerQuantity.token.address,
  );
  const takerAssetData = assetDataUtils.encodeERC20AssetData(
    takerQuantity.token.address,
  );

  // tslint:disable:object-literal-sort-keys
  const order: Order = {
    exchangeAddress: `${exchangeAddress.toLowerCase()}`,
    makerAddress: `${from.toLowerCase()}`,
    takerAddress: constants.NULL_ADDRESS,
    senderAddress: constants.NULL_ADDRESS,
    feeRecipientAddress: constants.NULL_ADDRESS,
    expirationTimeSeconds: new BigNumber(
      Math.ceil((Date.now() + duration) / 1000),
    ),
    salt: generatePseudoRandomSalt(),
    makerAssetAmount: new BigNumber(`${makerQuantity.quantity}`),
    takerAssetAmount: new BigNumber(`${takerQuantity.quantity}`),
    makerAssetData,
    takerAssetData,
    makerFee: constants.ZERO_AMOUNT,
    takerFee: constants.ZERO_AMOUNT,
  };

  const orderHash = orderHashUtils.getOrderHashHex(order);

  return {
    order,
    orderHash,
  };
};

// This is just a reference implementation
const sign0xOrder = async (
  { order, orderHash }: Sign0xOrderArgs,
  environment = getGlobalEnvironment(),
): Promise<SignedOrder> => {
  const signature = await environment.eth.sign(orderHash, order.makerAddress);
  const signedOrder = { ...order, signature };
  return signedOrder;
};

export { create0xOrder, sign0xOrder };
