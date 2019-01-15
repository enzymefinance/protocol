// tslint:disable:max-line-length
/*
"TODO: Remove this
ReferenceError: regeneratorRuntime is not defined
  at node_modules/@ledgerhq/hw-transport-u2f/lib/TransportU2F.js:120:50      at node_modules/@ledgerhq/hw-transport-u2f/lib/TransportU2F.js:142:6
  at Object.<anonymous> (node_modules/@ledgerhq/hw-transport-u2f/lib/TransportU2F.js:228:2)
  at Object.<anonymous> (node_modules/@0xproject/subproviders/src/index.ts:2:1)
*/
// tslint:enable:max-line-length

import {
  generatePseudoRandomSalt,
  assetDataUtils,
  signatureUtils,
  orderHashUtils,
} from '@0x/order-utils';
import { BigNumber } from 'bignumber.js';
import { Order } from '@0x/types';
import { constants } from '@0x/order-utils/lib/src/constants';
import {
  add,
  Address,
  BigInteger,
  createQuantity,
  QuantityInterface,
  toBI,
} from '@melonproject/token-math';

import { getLatestBlock } from '~/utils/evm';
import { getAssetProxy } from '../calls/getAssetProxy';
import { getToken } from '~/contracts/dependencies/token/calls/getToken';
import { approve } from '~/contracts/dependencies/token/transactions/approve';
import { Environment } from '~/utils/environment/Environment';

export interface CreateOrderArgs {
  makerQuantity: QuantityInterface;
  takerQuantity: QuantityInterface;
  duration?: number;
  makerAddress?: Address;
  feeRecipientAddress?: Address;
  takerFee?: BigInteger;
}

/**
 * For Ethfinex orders: The makerQuantity.token has to be the
 * Ethfinex Wrapper contract
 */
const createOrder = async (
  environment: Environment,
  exchange: Address,
  {
    makerQuantity,
    takerQuantity,
    duration = 24 * 60 * 60,
    makerAddress: givenMakerAddress,
    feeRecipientAddress,
    takerFee,
  }: CreateOrderArgs,
): Promise<Order> => {
  const makerAssetData = assetDataUtils.encodeERC20AssetData(
    makerQuantity.token.address,
  );

  const takerAssetData = assetDataUtils.encodeERC20AssetData(
    takerQuantity.token.address,
  );

  const latestBlock = await getLatestBlock(environment);
  const makerAddress = givenMakerAddress || environment.wallet.address;
  const formattedTakerFee = takerFee
    ? new BigNumber(`${takerFee}`)
    : constants.ZERO_AMOUNT;

  // tslint:disable:object-literal-sort-keys
  const order: Order = {
    exchangeAddress: `${exchange.toLowerCase()}`,
    makerAddress: `${makerAddress.toLowerCase()}`,
    takerAddress: constants.NULL_ADDRESS,
    senderAddress: constants.NULL_ADDRESS,
    feeRecipientAddress: (
      feeRecipientAddress || constants.NULL_ADDRESS
    ).toLowerCase(),
    expirationTimeSeconds: new BigNumber(
      add(toBI(latestBlock.timestamp), toBI(duration)).toString(),
    ),
    salt: generatePseudoRandomSalt(),
    makerAssetAmount: new BigNumber(`${makerQuantity.quantity}`),
    takerAssetAmount: new BigNumber(`${takerQuantity.quantity}`),
    makerAssetData,
    takerAssetData,
    makerFee: constants.ZERO_AMOUNT,
    takerFee: formattedTakerFee,
  };

  return order;
};

const approveOrder = async (
  environment: Environment,
  exchange: Address,
  order: Order,
) => {
  const erc20Proxy = await getAssetProxy(environment, exchange);

  const makerTokenAddress = assetDataUtils.decodeERC20AssetData(
    order.makerAssetData,
  ).tokenAddress;

  const makerToken = await getToken(environment, makerTokenAddress);
  const makerQuantity = createQuantity(
    makerToken,
    order.makerAssetAmount.toString(),
  );

  await approve(environment, { howMuch: makerQuantity, spender: erc20Proxy });
};

const isValidSignatureOffChain = async (
  environment: Environment,
  order: Order,
  signature: string,
  makerAddress?: Address,
): Promise<boolean> => {
  const orderHashHex = orderHashUtils.getOrderHashHex(order);

  return signatureUtils.isValidSignatureAsync(
    environment.eth.currentProvider,
    orderHashHex,
    signature,
    (makerAddress || environment.wallet.address).toString(),
  );
};

export { createOrder, approveOrder, isValidSignatureOffChain };
