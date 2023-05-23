import type { AddressLike } from '@enzymefinance/ethers';
import { resolveAddress } from '@enzymefinance/ethers';
import type { BigNumberish, BytesLike, Signer } from 'ethers';
import { BigNumber, constants, utils } from 'ethers';

import { encodeArgs } from '../encoding';
import { isTypedDataSigner } from '../signer';

export type ZeroExV4Order<TOrderType extends ZeroExV4OrderType> = TOrderType extends ZeroExV4OrderType.Limit
  ? ZeroExV4LimitOrder
  : TOrderType extends ZeroExV4OrderType.Rfq
  ? ZeroExV4RfqOrder
  : never;

export interface ZeroExV4LimitOrder {
  makerToken: string;
  takerToken: string;
  makerAmount: string;
  takerAmount: string;
  takerTokenFeeAmount: string;
  maker: string;
  taker: string;
  sender: string;
  feeRecipient: string;
  pool: string;
  expiry: number;
  salt: string;
}

export interface ZeroExV4RfqOrder {
  makerToken: string;
  takerToken: string;
  makerAmount: string;
  takerAmount: string;
  maker: string;
  taker: string;
  txOrigin: string;
  pool: string;
  expiry: number;
  salt: string;
}

export interface ZeroExV4Signature {
  type: string;
  r: string;
  s: string;
  v: string;
}

export enum ZeroExV4OrderType {
  Limit,
  Rfq,
}

function generatePseudoRandomZeroExV4Salt() {
  const hex = utils.hexlify(utils.randomBytes(32));
  const number = BigNumber.from(hex);

  return BigNumber.from(`${number}`.slice(0, 10));
}

export function createUnsignedZeroExV4LimitOrder({
  makerToken,
  takerToken,
  makerAmount,
  takerAmount,
  takerTokenFeeAmount = 0,
  maker,
  taker = constants.AddressZero,
  sender = constants.AddressZero,
  feeRecipient = constants.AddressZero,
  pool = '0x0000000000000000000000000000000000000000000000000000000000000000',
  expiry,
}: {
  makerToken: AddressLike;
  takerToken: AddressLike;
  makerAmount: BigNumberish;
  takerAmount: BigNumberish;
  takerTokenFeeAmount?: BigNumberish;
  maker: AddressLike;
  taker?: AddressLike;
  sender?: AddressLike;
  feeRecipient?: AddressLike;
  pool?: BytesLike;
  expiry: number;
}): ZeroExV4LimitOrder {
  const salt = generatePseudoRandomZeroExV4Salt();

  return {
    makerToken: resolveAddress(makerToken).toLowerCase(),
    takerToken: resolveAddress(takerToken).toLowerCase(),
    makerAmount: makerAmount.toString(),
    takerAmount: takerAmount.toString(),
    takerTokenFeeAmount: takerTokenFeeAmount.toString(),
    maker: resolveAddress(maker).toLowerCase(),
    taker: resolveAddress(taker).toLowerCase(),
    sender: resolveAddress(sender).toLowerCase(),
    feeRecipient: resolveAddress(feeRecipient).toLowerCase(),
    pool: pool.toString(),
    expiry,
    salt: salt.toString(),
  };
}

export function createUnsignedZeroExV4RfqOrder({
  makerToken,
  takerToken,
  makerAmount,
  takerAmount,
  maker,
  taker = constants.AddressZero,
  txOrigin,
  pool = '0x0000000000000000000000000000000000000000000000000000000000000000',
  expiry,
}: {
  makerToken: AddressLike;
  takerToken: AddressLike;
  makerAmount: BigNumberish;
  takerAmount: BigNumberish;
  maker: AddressLike;
  taker?: AddressLike;
  txOrigin: AddressLike;
  pool?: BytesLike;
  expiry: number;
}): ZeroExV4RfqOrder {
  const salt = generatePseudoRandomZeroExV4Salt();

  return {
    makerToken: resolveAddress(makerToken).toLowerCase(),
    takerToken: resolveAddress(takerToken).toLowerCase(),
    makerAmount: makerAmount.toString(),
    takerAmount: takerAmount.toString(),
    maker: resolveAddress(maker).toLowerCase(),
    taker: resolveAddress(taker).toLowerCase(),
    txOrigin: resolveAddress(txOrigin).toLowerCase(),
    pool: pool.toString(),
    expiry,
    salt: salt.toString(),
  };
}

export async function signZeroExV4LimitOrder({
  order,
  chainId,
  exchangeAddress,
  signer,
}: {
  order: ZeroExV4LimitOrder;
  chainId: number;
  exchangeAddress: AddressLike;
  signer: Signer;
}): Promise<ZeroExV4Signature> {
  if (!isTypedDataSigner(signer)) {
    throw new Error('Signer does not support typed data');
  }

  const domain = {
    name: 'ZeroEx',
    version: '1.0.0',
    chainId,
    verifyingContract: resolveAddress(exchangeAddress).toLowerCase(),
  };

  const types = {
    LimitOrder: [
      { name: 'makerToken', type: 'address' },
      { name: 'takerToken', type: 'address' },
      { name: 'makerAmount', type: 'uint128' },
      { name: 'takerAmount', type: 'uint128' },
      { name: 'takerTokenFeeAmount', type: 'uint128' },
      { name: 'maker', type: 'address' },
      { name: 'taker', type: 'address' },
      { name: 'sender', type: 'address' },
      { name: 'feeRecipient', type: 'address' },
      { name: 'pool', type: 'bytes32' },
      { name: 'expiry', type: 'uint64' },
      { name: 'salt', type: 'uint256' },
    ],
  };

  const signature = await signer._signTypedData(domain, types, order);
  const split = utils.splitSignature(signature);
  const type = utils.hexlify(2); // EIP712

  return {
    type,
    v: utils.hexlify(split.v),
    r: split.r,
    s: split.s,
  };
}

export async function signZeroExV4RfqOrder({
  order,
  chainId,
  exchangeAddress,
  signer,
}: {
  order: ZeroExV4RfqOrder;
  chainId: number;
  exchangeAddress: AddressLike;
  signer: Signer;
}): Promise<ZeroExV4Signature> {
  if (!isTypedDataSigner(signer)) {
    throw new Error('Signer does not support typed data');
  }

  const domain = {
    name: 'ZeroEx',
    version: '1.0.0',
    chainId,
    verifyingContract: resolveAddress(exchangeAddress).toLowerCase(),
  };

  const types = {
    RfqOrder: [
      { name: 'makerToken', type: 'address' },
      { name: 'takerToken', type: 'address' },
      { name: 'makerAmount', type: 'uint128' },
      { name: 'takerAmount', type: 'uint128' },
      { name: 'maker', type: 'address' },
      { name: 'taker', type: 'address' },
      { name: 'txOrigin', type: 'address' },
      { name: 'pool', type: 'bytes32' },
      { name: 'expiry', type: 'uint64' },
      { name: 'salt', type: 'uint256' },
    ],
  };

  const signature = await signer._signTypedData(domain, types, order);
  const split = utils.splitSignature(signature);
  const type = utils.hexlify(2); // EIP712

  return {
    type,
    v: utils.hexlify(split.v),
    r: split.r,
    s: split.s,
  };
}

const zeroExV4LimitOrderTuple = utils.ParamType.fromString(
  'tuple(address makerToken, address takerToken, uint128 makerAmount, uint128 takerAmount, uint128 takerTokenFeeAmount, address maker, address taker, address sender, address feeRecipient, bytes32 pool, uint64 expiry, uint256 salt)',
);

const zeroExV4RfqOrderTuple = utils.ParamType.fromString(
  'tuple(address makerToken, address takerToken, uint128 makerAmount, uint128 takerAmount, address maker, address taker, address txOrigin, bytes32 pool, uint64 expiry, uint256 salt)',
);

const zeroExV4SignatureTuple = utils.ParamType.fromString('tuple(uint8 type, uint8 v, bytes32 r, bytes32 s)');

export function encodeZeroExV4LimitOrder(order: ZeroExV4LimitOrder, signature: ZeroExV4Signature) {
  return encodeArgs(
    [zeroExV4LimitOrderTuple, zeroExV4SignatureTuple],
    [
      [
        order.makerToken,
        order.takerToken,
        order.makerAmount,
        order.takerAmount,
        order.takerTokenFeeAmount,
        order.maker,
        order.taker,
        order.sender,
        order.feeRecipient,
        order.pool,
        order.expiry,
        order.salt,
      ],
      [signature.type, signature.v, signature.r, signature.s],
    ],
  );
}

export function encodeZeroExV4RfqOrder(order: ZeroExV4RfqOrder, signature: ZeroExV4Signature) {
  return encodeArgs(
    [zeroExV4RfqOrderTuple, zeroExV4SignatureTuple],
    [
      [
        order.makerToken,
        order.takerToken,
        order.makerAmount,
        order.takerAmount,
        order.maker,
        order.taker,
        order.txOrigin,
        order.pool,
        order.expiry,
        order.salt,
      ],
      [signature.type, signature.v, signature.r, signature.s],
    ],
  );
}

export function encodeZeroExV4Order<TOrderType extends ZeroExV4OrderType>(
  order: ZeroExV4Order<TOrderType>,
  signature: ZeroExV4Signature,
  orderType: TOrderType,
) {
  if (orderType === ZeroExV4OrderType.Limit) {
    return encodeZeroExV4LimitOrder(order as ZeroExV4LimitOrder, signature);
  }

  if (orderType === ZeroExV4OrderType.Rfq) {
    return encodeZeroExV4RfqOrder(order as ZeroExV4RfqOrder, signature);
  }

  throw new Error('Unsupported Order Type');
}

export function zeroExV4TakeOrderArgs<TOrderType extends ZeroExV4OrderType>({
  order,
  signature,
  takerAssetFillAmount,
  orderType,
}: {
  order: ZeroExV4Order<TOrderType>;
  signature: ZeroExV4Signature;
  takerAssetFillAmount: BigNumberish;
  orderType: TOrderType;
}) {
  return encodeArgs(
    ['bytes', 'uint128', 'uint256'],
    [encodeZeroExV4Order(order, signature, orderType), takerAssetFillAmount, orderType],
  );
}
