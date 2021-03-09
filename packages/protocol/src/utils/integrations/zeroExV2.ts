import { AddressLike, resolveAddress } from '@enzymefinance/ethers';
import { BigNumber, BigNumberish, constants, Signer, utils } from 'ethers';
import { buildTypedData, encodeTypedDataDigest } from 'ethers-eip712';
import { encodeArgs, encodeFunctionData } from '../encoding';

export interface UnsignedZeroExV2Order {
  exchangeAddress: string;
  makerAddress: string;
  takerAddress: string;
  feeRecipientAddress: string;
  senderAddress: string;
  makerAssetAmount: string;
  takerAssetAmount: string;
  makerFee: string;
  takerFee: string;
  expirationTimeSeconds: string;
  salt: string;
  makerAssetData: string;
  takerAssetData: string;
  makerAsset: string;
  takerAsset: string;
}

export interface SignedZeroExV2Order extends UnsignedZeroExV2Order {
  signature: string;
}

export function generatePseudoRandomZeroExV2Salt() {
  const hex = utils.hexlify(utils.randomBytes(32));
  const number = BigNumber.from(hex);
  return BigNumber.from(`${number}`.slice(0, 10));
}

export const zeroExV2AssetFragment = utils.FunctionFragment.fromString('ERC20Token(address)');

export function encodeZeroExV2AssetData(token: AddressLike) {
  const lowerCaseAddress = resolveAddress(token).toLowerCase();
  return encodeFunctionData(zeroExV2AssetFragment, [lowerCaseAddress]);
}

export async function createUnsignedZeroExV2Order({
  exchange,
  maker,
  feeRecipientAddress,
  makerAssetAmount,
  takerAssetAmount,
  takerFee,
  makerAsset,
  takerAsset,
  expirationTimeSeconds,
}: {
  exchange: AddressLike;
  maker: AddressLike;
  feeRecipientAddress: AddressLike;
  makerAssetAmount: BigNumberish;
  takerAssetAmount: BigNumberish;
  takerFee: BigNumberish;
  duration?: number;
  makerAsset: AddressLike;
  takerAsset: AddressLike;
  expirationTimeSeconds: BigNumberish;
}): Promise<UnsignedZeroExV2Order> {
  const makerAddress = resolveAddress(maker).toLowerCase();
  const exchangeAddress = resolveAddress(exchange).toLowerCase();
  const makerAssetAddress = resolveAddress(makerAsset).toLowerCase();
  const takerAssetAddress = resolveAddress(takerAsset).toLowerCase();

  const makerAssetData = encodeZeroExV2AssetData(makerAssetAddress);
  const takerAssetData = encodeZeroExV2AssetData(takerAssetAddress);
  const salt = generatePseudoRandomZeroExV2Salt();

  return {
    exchangeAddress,
    makerAddress,
    takerAddress: constants.AddressZero,
    feeRecipientAddress: feeRecipientAddress.toString(),
    senderAddress: constants.AddressZero,
    makerAssetAmount: makerAssetAmount.toString(),
    takerAssetAmount: takerAssetAmount.toString(),
    makerFee: constants.Zero.toString(),
    takerFee: takerFee.toString(),
    expirationTimeSeconds: expirationTimeSeconds.toString(),
    salt: salt.toString(),
    makerAssetData,
    takerAssetData,
    makerAsset: makerAssetAddress,
    takerAsset: takerAssetAddress,
  };
}

export async function signZeroExV2Order(order: UnsignedZeroExV2Order, signer: Signer): Promise<SignedZeroExV2Order> {
  const orderTypedData = createZeroExV2OrderTypedData(order);
  const orderHashHex = encodeTypedDataDigest(orderTypedData);
  const signature = await signer.signMessage(orderHashHex);
  const split = utils.splitSignature(signature);
  const type = utils.hexlify(3); // ETHSign
  const joined = utils.hexlify(utils.concat([utils.hexlify(split.v), split.r, split.s, type]));

  return {
    ...order,
    signature: joined,
  };
}

export function createZeroExV2OrderTypedData(order: UnsignedZeroExV2Order) {
  const domain = {
    name: '0x Protocol',
    version: '2',
    verifyingContract: order.exchangeAddress,
  };

  const types = {
    Order: [
      { name: 'makerAddress', type: 'address' },
      { name: 'takerAddress', type: 'address' },
      { name: 'feeRecipientAddress', type: 'address' },
      { name: 'senderAddress', type: 'address' },
      { name: 'makerAssetAmount', type: 'uint256' },
      { name: 'takerAssetAmount', type: 'uint256' },
      { name: 'makerFee', type: 'uint256' },
      { name: 'takerFee', type: 'uint256' },
      { name: 'expirationTimeSeconds', type: 'uint256' },
      { name: 'salt', type: 'uint256' },
      { name: 'makerAssetData', type: 'bytes' },
      { name: 'takerAssetData', type: 'bytes' },
    ],
  };

  return buildTypedData(domain, types, 'Order', order);
}

export function encodeZeroExV2Order(order: SignedZeroExV2Order) {
  return encodeArgs(
    ['address[4]', 'uint256[6]', 'bytes[2]', 'bytes'],
    [
      [order.makerAddress, order.takerAddress, order.feeRecipientAddress, order.senderAddress],
      [
        order.makerAssetAmount,
        order.takerAssetAmount,
        order.makerFee,
        order.takerFee,
        order.expirationTimeSeconds,
        order.salt,
      ],
      [order.makerAssetData, order.takerAssetData],
      order.signature,
    ],
  );
}

export function zeroExV2TakeOrderArgs({
  signedOrder,
  takerAssetFillAmount,
}: {
  signedOrder: SignedZeroExV2Order;
  takerAssetFillAmount: BigNumberish;
}) {
  return encodeArgs(['bytes', 'uint256'], [encodeZeroExV2Order(signedOrder), takerAssetFillAmount]);
}
