import type { AddressLike } from '@enzymefinance/ethers';
import type { BigNumberish, BytesLike } from 'ethers';
import { utils } from 'ethers';

import { encodeArgs } from '../encoding';

// named ~Interface to disambiguate from ParaSwapV5Adapter contract
export interface ParaSwapV5AdapterInterface {
  adapter: AddressLike;
  percent: BigNumberish;
  networkFee: BigNumberish;
  route: ParaSwapV5Route[];
}

export interface ParaSwapV5Route {
  index: BigNumberish;
  targetExchange: AddressLike;
  percent: BigNumberish;
  payload: BytesLike;
  networkFee: BigNumberish;
}

export interface ParaSwapV5Path {
  to: AddressLike;
  totalNetworkFee: BigNumberish;
  adapters: ParaSwapV5AdapterInterface[];
}

export interface ParaSwapV5TakeOrder {
  minIncomingAssetAmount: BigNumberish;
  expectedIncomingAssetAmount: BigNumberish;
  outgoingAsset: AddressLike;
  outgoingAssetAmount: BigNumberish;
  uuid: BytesLike;
  paths: ParaSwapV5Path[];
}

export const paraSwapV5RouteTuple = utils.ParamType.fromString(
  'tuple(uint256 index, address targetExchange, uint256 percent, bytes payload, uint256 networkFee)',
);
export const paraSwapV5RouteTupleArray = `${paraSwapV5RouteTuple.format('full')}[]`;

export const paraSwapV5AdapterTuple = utils.ParamType.fromString(
  `tuple(address adapter, uint256 percent, uint256 networkFee, ${paraSwapV5RouteTupleArray} route)`,
);
export const paraSwapV5AdapterTupleArray = `${paraSwapV5AdapterTuple.format('full')}[]`;

export const paraSwapV5PathTuple = utils.ParamType.fromString(
  `tuple(address to, uint256 totalNetworkFee, ${paraSwapV5AdapterTupleArray} adapters)`,
);
export const paraSwapV5PathTupleArray = `${paraSwapV5PathTuple.format('full')}[]`;

export function paraSwapV5TakeMultipleOrdersArgs({
  ordersData,
  allowOrdersToFail,
}: {
  ordersData: BytesLike[];
  allowOrdersToFail: boolean;
}) {
  return encodeArgs(['bytes[]', 'bool'], [ordersData, allowOrdersToFail]);
}

export function paraSwapV5TakeOrderArgs({
  minIncomingAssetAmount,
  expectedIncomingAssetAmount, // Passed as a courtesy to ParaSwap for analytics
  outgoingAsset,
  outgoingAssetAmount,
  uuid,
  paths,
}: ParaSwapV5TakeOrder) {
  return encodeArgs(
    ['uint256', 'uint256', 'address', 'uint256', 'bytes16', paraSwapV5PathTupleArray],
    [minIncomingAssetAmount, expectedIncomingAssetAmount, outgoingAsset, outgoingAssetAmount, uuid, paths],
  );
}
